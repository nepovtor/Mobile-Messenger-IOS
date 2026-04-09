import { createHash } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtPayload } from "../../auth.types";
import { User } from "../../entities/user.entity";
import { PasswordLoginDto } from "./dto/password-login.dto";
import { RequestCodeDto } from "./dto/request-code.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { VerifyCodeDto } from "./dto/verify-code.dto";

interface DemoAccountSeed {
  readonly phone: string;
  readonly displayName: string;
  readonly password: string;
}

const DEMO_ACCOUNTS: readonly DemoAccountSeed[] = [
  {
    phone: "+15551230011",
    displayName: "Анна Demo",
    password: "demo1111",
  },
  {
    phone: "+15551230012",
    displayName: "Борис Demo",
    password: "demo2222",
  },
  {
    phone: "+15551230013",
    displayName: "Вера Demo",
    password: "demo3333",
  },
  {
    phone: "+15551230014",
    displayName: "Глеб Demo",
    password: "demo4444",
  },
  {
    phone: "+15551230015",
    displayName: "Даша Demo",
    password: "demo5555",
  },
] as const;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly codes = new Map<string, { code: string; expires: Date }>();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    await this.seedDemoAccounts();
  }

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

  async signInWithPassword({
    method,
    contact,
    password,
  }: PasswordLoginDto) {
    if (method !== "phone") {
      throw new BadRequestException("Only phone method supported");
    }

    const user = await this.userRepository.findOne({ where: { phone: contact } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException("Invalid phone or password");
    }

    const passwordHash = this.hashPassword(password);
    if (user.passwordHash !== passwordHash) {
      throw new UnauthorizedException("Invalid phone or password");
    }

    return this.createSessionResponse(user);
  }

  async listContacts(userID: string) {
    await this.requireUser(userID);

    const order = new Map(
      DEMO_ACCOUNTS.map((account, index) => [account.phone, index]),
    );
    const contacts = await this.userRepository.find({
      where: { isDemo: true },
      order: { createdAt: "ASC" },
    });

    return contacts
      .sort(
        (left, right) =>
          (order.get(left.phone) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.phone) ?? Number.MAX_SAFE_INTEGER),
      )
      .map((contact) => ({
        userID: contact.id,
        displayName: contact.displayName,
        phone: contact.phone,
        isCurrentUser: contact.id === userID,
      }));
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

  private async seedDemoAccounts() {
    for (const account of DEMO_ACCOUNTS) {
      const passwordHash = this.hashPassword(account.password);
      const existingUser = await this.userRepository.findOne({
        where: { phone: account.phone },
      });

      if (!existingUser) {
        await this.userRepository.save(
          this.userRepository.create({
            phone: account.phone,
            displayName: account.displayName,
            passwordHash,
            isDemo: true,
          }),
        );
        continue;
      }

      let shouldSave = false;

      if (!existingUser.isDemo) {
        existingUser.isDemo = true;
        shouldSave = true;
      }
      if (existingUser.passwordHash !== passwordHash) {
        existingUser.passwordHash = passwordHash;
        shouldSave = true;
      }
      if (existingUser.displayName !== account.displayName) {
        existingUser.displayName = account.displayName;
        shouldSave = true;
      }

      if (shouldSave) {
        await this.userRepository.save(existingUser);
      }
    }

    this.logger.log(`Seeded ${DEMO_ACCOUNTS.length} demo accounts`);
  }

  private hashPassword(password: string): string {
    const normalizedPassword = password.trim();
    const salt = process.env.DEMO_PASSWORD_SALT ?? "mobile-messenger-demo";

    return createHash("sha256")
      .update(`${salt}:${normalizedPassword}`)
      .digest("hex");
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
