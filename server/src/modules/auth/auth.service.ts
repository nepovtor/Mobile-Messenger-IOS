import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtPayload } from "../../auth.types";
import { User } from "../../entities/user.entity";
import { RequestCodeDto } from "./dto/request-code.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { VerifyCodeDto } from "./dto/verify-code.dto";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly codes = new Map<string, { code: string; expires: Date }>();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async requestCode({ method, contact }: RequestCodeDto) {
    if (method !== "phone") {
      throw new BadRequestException("Only phone method supported");
    }

    const code = process.env.AUTH_TEST_CODE ?? "123456";
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    this.codes.set(contact, { code, expires });
    this.logger.log(`Verification code generated for ${contact}`);
    this.logger.debug(`Verification code for ${contact}: ${code}`);

    return { expiresIn: 300 };
  }

  async verifyCode({ method, contact, code, displayName }: VerifyCodeDto) {
    if (method !== "phone") {
      throw new BadRequestException("Only phone method supported");
    }

    const stored = this.codes.get(contact);
    if (!stored || stored.code !== code || stored.expires < new Date()) {
      throw new UnauthorizedException("Invalid or expired code");
    }

    this.codes.delete(contact);

    let user = await this.userRepository.findOne({ where: { phone: contact } });
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
      userID: user.id,
      displayName: user.displayName,
      phone: user.phone,
    };
  }

  async updateProfile(userID: string, { displayName }: UpdateProfileDto) {
    const user = await this.requireUser(userID);
    const normalizedDisplayName = this.normalizeDisplayName(displayName);

    if (!normalizedDisplayName) {
      throw new BadRequestException(
        "Display name must be at least 2 characters",
      );
    }

    if (user.displayName !== normalizedDisplayName) {
      user.displayName = normalizedDisplayName;
      await this.userRepository.save(user);
    }

    return {
      ...this.createSessionResponse(user),
      phone: user.phone,
    };
  }

  private normalizeDisplayName(value?: string): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim().replace(/\s+/g, " ");
    return normalized.length >= 2 ? normalized : null;
  }

  private async requireUser(userID: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userID },
    });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    return user;
  }

  private createSessionResponse(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
      displayName: user.displayName,
    };
    const token = this.jwtService.sign(payload);

    return {
      token,
      userID: user.id,
      displayName: user.displayName,
    };
  }
}
