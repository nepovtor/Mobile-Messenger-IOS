import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  DEMO_ACCOUNTS,
  findDemoAccountByPhone,
} from "../../demo/demo-data";
import { User } from "../../entities/user.entity";
import { RequestCodeDto } from "./dto/request-code.dto";
import { LoginAuthDto } from "./dto/login-auth.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { VerifyCodeDto } from "./dto/verify-code.dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async requestCode({ method }: RequestCodeDto) {
    if (method !== "phone") {
      throw new BadRequestException("Only phone method supported");
    }

    await this.ensureDemoAccounts();
    return { expiresIn: 300 };
  }

  async verifyCode({ method, contact, code, displayName }: VerifyCodeDto) {
    if (method !== "phone") {
      throw new BadRequestException("Only phone method supported");
    }

    await this.ensureDemoAccounts();
    const demoAccount = findDemoAccountByPhone(contact);
    const acceptedCode =
      demoAccount?.code ?? process.env.AUTH_TEST_CODE?.trim() ?? "123456";

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
        id: demoAccount?.id,
        phone: contact,
        displayName:
          demoAccount?.displayName ?? requestedDisplayName ?? fallbackName,
      });

      await this.userRepository.save(user);
    } else if (demoAccount && user.id !== demoAccount.id) {
      throw new UnauthorizedException("Demo account mapping mismatch");
    } else if (demoAccount) {
      if (user.displayName !== demoAccount.displayName) {
        user.displayName = demoAccount.displayName;
        await this.userRepository.save(user);
      }
    } else if (displayName) {
      const requestedDisplayName = this.normalizeDisplayName(displayName);

      if (requestedDisplayName && requestedDisplayName !== user.displayName) {
        user.displayName = requestedDisplayName;
        await this.userRepository.save(user);
      }
    }

    return this.createSessionResponse(user);
  }

  async login({ method, contact, password }: LoginAuthDto) {
    if (method !== "phone") {
      throw new BadRequestException("Only phone method supported");
    }

    await this.ensureDemoAccounts();
    const demoAccount = DEMO_ACCOUNTS.find(
      (account) =>
        account.phone === contact && account.code === password.trim(),
    );

    if (!demoAccount) {
      throw new UnauthorizedException("Invalid demo credentials");
    }

    const user = await this.findOrCreateUser(
      demoAccount.phone,
      demoAccount.displayName,
      demoAccount.id,
    );

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

  async listContacts(userID: string) {
    await this.ensureDemoAccounts();
    const currentUser = await this.requireUser(userID);
    const users = await this.userRepository.find({
      order: { displayName: "ASC" },
    });
    const demoOrder = new Map(
      DEMO_ACCOUNTS.map((account, index) => [account.phone, index]),
    );

    return users
      .sort((left, right) => {
        if (left.id === currentUser.id) {
          return -1;
        }
        if (right.id === currentUser.id) {
          return 1;
        }

        const leftOrder = demoOrder.get(left.phone);
        const rightOrder = demoOrder.get(right.phone);

        if (leftOrder !== undefined && rightOrder !== undefined) {
          return leftOrder - rightOrder;
        }
        if (leftOrder !== undefined) {
          return -1;
        }
        if (rightOrder !== undefined) {
          return 1;
        }

        return left.displayName.localeCompare(right.displayName);
      })
      .map((user) => ({
        userID: user.id,
        displayName: user.displayName,
        contact: user.phone,
        isCurrentUser: user.id === currentUser.id,
      }));
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
      userID: user.id,
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
    const user = await this.userRepository.findOne({
      where: { id: userID },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  private createSessionResponse(user: User) {
    const userID = user.id;

    const token = this.jwtService.sign({
      sub: userID,
      userID,
      phone: user.phone,
      displayName: user.displayName,
    });

    return {
      token,
      userID,
      displayName: user.displayName,
      phone: user.phone,
    };
  }

  private async ensureDemoAccounts() {
    for (const account of DEMO_ACCOUNTS) {
      await this.findOrCreateUser(account.phone, account.displayName, account.id);
    }
  }

  private async findOrCreateUser(
    contact: string,
    displayName: string,
    id?: string,
  ) {
    let user = await this.userRepository.findOne({
      where: { phone: contact },
    });

    if (!user) {
      user = this.userRepository.create({
        id,
        phone: contact,
        displayName,
      });
      await this.userRepository.save(user);
      return user;
    }

    if (id && user.id !== id) {
      throw new UnauthorizedException(
        `Demo account ${contact} has unexpected user ID ${user.id}`,
      );
    }

    if (user.displayName !== displayName) {
      user.displayName = displayName;
      await this.userRepository.save(user);
    }

    return user;
  }
}
