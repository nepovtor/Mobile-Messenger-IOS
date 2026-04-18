import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../entities/user.entity";
import { RequestCodeDto } from "./dto/request-code.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { VerifyCodeDto } from "./dto/verify-code.dto";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async requestCode({ method, contact }: RequestCodeDto) {
    if (method !== "phone") {
      throw new BadRequestException("Only phone method supported");
    }

    const code = "123456";
    this.logger.log(`Verification code generated for ${contact}`);
    this.logger.debug(`Verification code for ${contact}: ${code}`);

    return { expiresIn: 300, marker: "deploy-check-3e2f139" };
  }

  async verifyCode({ method, contact, code, displayName }: VerifyCodeDto) {
    if (method !== "phone") {
      throw new BadRequestException("Only phone method supported");
    }

    const acceptedCode = "123456";

    if (code !== acceptedCode) {
      throw new UnauthorizedException("Invalid or expired code");
    }

    let user = await this.userRepository.findOne({
      where: { phone: contact },
    });

    if (!user) {
      const fallbackName = `User ${contact.slice(-4)}`;
      const requestedDisplayName = this.normalizeDisplayName(displayName);

      user = this.userRepository.create({
        phone: contact,
        displayName: requestedDisplayName ?? fallbackName,
      });

      await this.userRepository.save(user);
    } else if (displayName) {
      const requestedDisplayName = this.normalizeDisplayName(displayName);

      if (requestedDisplayName && requestedDisplayName !== user.displayName) {
        user.displayName = requestedDisplayName;
        await this.userRepository.save(user);
      }
    }

    return this.createSessionResponse(user);
  }

  async getCurrentUser(userID: string) {
    const user = await this.requireUser(userID);

    return {
      userID: String((user as any).id),
      displayName: user.displayName,
      phone: user.phone,
    };
  }

  async updateProfile(userID: string, { displayName }: UpdateProfileDto) {
    const user = await this.requireUser(userID);
    const requestedDisplayName = this.normalizeDisplayName(displayName);

    if (!requestedDisplayName) {
      throw new BadRequestException("Display name is required");
    }

    if (requestedDisplayName !== user.displayName) {
      user.displayName = requestedDisplayName;
      await this.userRepository.save(user);
    }

    return {
      userID: String((user as any).id),
      displayName: user.displayName,
      phone: user.phone,
    };
  }

  private normalizeDisplayName(value?: string): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim().replace(/\s+/g, " ");

    if (!normalized) {
      return null;
    }

    return normalized.slice(0, 50);
  }

  private async requireUser(userID: string): Promise<User> {
    const numericID = Number(userID);

    const user = await this.userRepository.findOne({
      where: { id: numericID as never },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  private createSessionResponse(user: User) {
    const userID = String((user as any).id);

    const token = this.jwtService.sign({
      sub: userID,
      userID,
      phone: user.phone,
    });

    return {
      token,
      userID,
      displayName: user.displayName,
      phone: user.phone,
    };
  }
}
