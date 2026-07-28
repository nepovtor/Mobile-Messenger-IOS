import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { createHmac, randomInt } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { PhoneVerificationCodeEntity } from "../../entities/phone-verification-code.entity";
import {
  TelegramLinkEntity,
  TelegramLinkState,
} from "../../entities/telegram-link.entity";
import { AuthMethod, UserEntity } from "../../entities/user.entity";
import {
  buildDisplayName,
  normalizeContact,
  normalizePhone,
} from "../common/contact.utils";
import {
  areDemoAccountsEnabled,
  getAuthCodeMaxAttempts,
  getAuthCodeResendCooldownSeconds,
  getAuthCodeTTLSeconds,
  getAuthRateLimitWindowMs,
  getAuthTestCode,
  getJwtExpiresIn,
  getJwtSecret,
  getPhoneRequestRateLimitMaxRequests,
  getVerificationProvider,
  isPasswordLoginEnabled,
  isTestCodeAllowed,
  shouldExposeDebugAuthCode,
} from "../common/runtime-config";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { LoginAuthDto } from "./dto/login-auth.dto";
import { LabLoginDto } from "./dto/lab-login.dto";
import { RequestAuthDto } from "./dto/request-auth.dto";
import { VerifyAuthDto } from "./dto/verify-auth.dto";
import {
  SMS_SERVICE,
  SmsProviderUnavailableError,
  SmsService,
  TelegramNotLinkedError,
} from "./sms/sms.types";

type AuthResult = {
  token: string;
  userID: string;
  login: string;
  displayName: string;
  phone: string;
};

type DemoAccount = {
  method: AuthMethod;
  contact: string;
  displayName: string;
  password: string;
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly codeTTLSeconds = getAuthCodeTTLSeconds();
  private readonly codeMaxAttempts = getAuthCodeMaxAttempts();
  private readonly resendCooldownSeconds = getAuthCodeResendCooldownSeconds();
  private readonly demoAccounts: DemoAccount[] = [
    {
      method: AuthMethod.PHONE,
      contact: "+15551230011",
      displayName: "Анна Demo",
      password: "demo1111",
    },
    {
      method: AuthMethod.PHONE,
      contact: "+15551230012",
      displayName: "Борис Demo",
      password: "demo2222",
    },
    {
      method: AuthMethod.PHONE,
      contact: "+15551230013",
      displayName: "Вера Demo",
      password: "demo3333",
    },
    {
      method: AuthMethod.PHONE,
      contact: "+15551230014",
      displayName: "Глеб Demo",
      password: "demo4444",
    },
    {
      method: AuthMethod.PHONE,
      contact: "+15551230015",
      displayName: "Даша Demo",
      password: "demo5555",
    },
  ];

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(PhoneVerificationCodeEntity)
    private readonly verificationCodesRepository: Repository<PhoneVerificationCodeEntity>,
    @InjectRepository(TelegramLinkEntity)
    private readonly telegramLinksRepository: Repository<TelegramLinkEntity>,
    private readonly jwtService: JwtService,
    private readonly authRateLimitService: AuthRateLimitService,
    @Inject(SMS_SERVICE)
    private readonly smsService: SmsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!areDemoAccountsEnabled()) {
      return;
    }

    for (const account of this.demoAccounts) {
      await this.findOrCreateUser(
        account.method,
        account.contact,
        account.displayName,
        undefined,
        true,
      );
    }
  }

  async requestCode(
    dto: RequestAuthDto,
    requestContext?: {
      requestIP?: string | null;
      userAgent?: string | null;
    },
  ): Promise<{
    status: "code_sent";
    delivery: string;
    resendAfterSeconds: number;
    expiresIn: number;
    debugCode?: string;
  }> {
    const phone = this.resolvePhone(dto);
    this.authRateLimitService.consume(`request:phone:${phone}`, {
      maxRequests: getPhoneRequestRateLimitMaxRequests(),
      windowMs: getAuthRateLimitWindowMs(),
      message: "Too many auth requests for this phone number",
    });

    const activeCode = await this.findLatestCode(phone);
    const now = new Date();
    if (
      activeCode &&
      !activeCode.consumedAt &&
      activeCode.resendAvailableAt.getTime() > now.getTime()
    ) {
      throw new HttpException(
        `Resend cooldown active. Try again in ${Math.ceil((activeCode.resendAvailableAt.getTime() - now.getTime()) / 1000)} seconds`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.generateVerificationCode();
    const codeEntity = this.verificationCodesRepository.create({
      phone,
      codeHash: this.hashVerificationCode(phone, code),
      expiresAt: new Date(now.getTime() + this.codeTTLSeconds * 1000),
      attempts: 0,
      consumedAt: null,
      resendAvailableAt: new Date(
        now.getTime() + this.resendCooldownSeconds * 1000,
      ),
      requestIP: requestContext?.requestIP ?? null,
      userAgent: requestContext?.userAgent ?? null,
    });

    await this.verificationCodesRepository.save(codeEntity);

    try {
      await this.smsService.sendVerificationCode(phone, code);
    } catch (error) {
      await this.verificationCodesRepository.delete({ id: codeEntity.id });
      if (error instanceof TelegramNotLinkedError) {
        throw new HttpException(
          {
            code: error.code,
            message: error.message,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (error instanceof SmsProviderUnavailableError) {
        throw new ServiceUnavailableException(
          "Verification provider unavailable",
        );
      }

      this.logger.error(
        `Failed to deliver verification code for ${phone}`,
        error as Error,
      );
      throw new ServiceUnavailableException(
        "Verification provider unavailable",
      );
    }

    return {
      status: "code_sent",
      delivery: getVerificationProvider(),
      resendAfterSeconds: this.resendCooldownSeconds,
      expiresIn: this.codeTTLSeconds,
      ...(shouldExposeDebugAuthCode() ? { debugCode: code } : {}),
    };
  }

  async verifyCode(dto: VerifyAuthDto): Promise<{
    token: string;
    userID: string;
    displayName: string;
    phone: string;
  }> {
    const phone = this.resolvePhone(dto);
    const verificationCode = await this.findLatestCode(phone);

    if (!verificationCode) {
      throw new UnauthorizedException("Invalid verification code");
    }

    if (verificationCode.consumedAt) {
      throw new UnauthorizedException(
        "Verification code has already been used",
      );
    }

    if (verificationCode.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Verification code expired");
    }

    if (verificationCode.attempts >= this.codeMaxAttempts) {
      throw new HttpException(
        "Too many verification attempts",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const submittedCode = dto.code.trim();
    if (
      this.hashVerificationCode(phone, submittedCode) !==
      verificationCode.codeHash
    ) {
      verificationCode.attempts += 1;
      await this.verificationCodesRepository.save(verificationCode);

      if (verificationCode.attempts >= this.codeMaxAttempts) {
        throw new HttpException(
          "Too many verification attempts",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new UnauthorizedException("Invalid verification code");
    }

    verificationCode.consumedAt = new Date();
    await this.verificationCodesRepository.save(verificationCode);
    const telegramLink = await this.telegramLinksRepository.findOne({
      where: {
        phone,
        revokedAt: IsNull(),
      },
    });

    const user = await this.findOrCreateUser(
      AuthMethod.PHONE,
      phone,
      this.findDemoAccount(AuthMethod.PHONE, phone)?.displayName,
      telegramLink ?? undefined,
    );

    if (telegramLink && telegramLink.userId !== user.id) {
      telegramLink.userId = user.id;
      telegramLink.state = TelegramLinkState.LINKED;
      await this.telegramLinksRepository.save(telegramLink);
    }

    return this.buildAuthResult(user);
  }

  async login(dto: LoginAuthDto): Promise<AuthResult> {
    if (dto.login?.trim()) {
      const user = await this.authenticateUserByLogin(dto.login, dto.password);
      return this.buildAuthResult(user);
    }

    if (!areDemoAccountsEnabled() || !isPasswordLoginEnabled()) {
      throw new ForbiddenException("Password login is disabled");
    }

    const normalizedMethod = dto.method ?? AuthMethod.PHONE;
    const normalizedContact = this.resolveContact(dto);
    const demoAccount = this.findDemoAccount(
      normalizedMethod,
      normalizedContact,
    );
    const password = dto.password.trim();

    if (!demoAccount || password !== demoAccount.password) {
      throw new UnauthorizedException("Invalid demo credentials");
    }

    const user = await this.findOrCreateUser(
      normalizedMethod,
      normalizedContact,
      demoAccount.displayName,
    );

    return this.buildAuthResult(user);
  }

  async loginLabUser(dto: LabLoginDto): Promise<{ token: string }> {
    const user = await this.authenticateUserByLogin(dto.login, dto.password);
    const result = await this.buildAuthResult(user);
    return {
      token: result.token,
    };
  }

  async getMe(userID: string): Promise<{
    userID: string;
    login: string;
    displayName: string;
    contact: string;
    method: string;
    phone: string | null;
    telegramChatId: string | null;
    telegramUsername: string | null;
  }> {
    const user = await this.usersRepository.findOneBy({
      id: userID as UserEntity["id"],
    });
    if (!user) {
      throw new BadRequestException("User not found");
    }

    return {
      userID: user.id,
      login: user.login ?? user.contact,
      displayName: user.displayName,
      contact: user.contact,
      method: user.method,
      phone: user.phone,
      telegramChatId: user.telegramChatId,
      telegramUsername: user.telegramUsername,
    };
  }

  private findDemoAccount(
    method: AuthMethod,
    contact: string,
  ): DemoAccount | undefined {
    return this.demoAccounts.find(
      (account) => account.method === method && account.contact === contact,
    );
  }

  private async findOrCreateUser(
    method: AuthMethod,
    contact: string,
    preferredDisplayName?: string,
    telegramLink?: TelegramLinkEntity,
    syncExistingDisplayName = false,
  ): Promise<UserEntity> {
    let user = await this.findUserByMethodAndContact(method, contact);

    const displayName =
      preferredDisplayName ?? buildDisplayName(method, contact);

    if (!user) {
      try {
        user = this.usersRepository.create({
          method,
          contact,
          login: null,
          phone: method === AuthMethod.PHONE ? contact : null,
          passwordHash: null,
          telegramChatId: telegramLink?.chatId ?? null,
          telegramUsername: telegramLink?.username ?? null,
          displayName,
        });

        return await this.usersRepository.save(user);
      } catch {
        const existingUser = await this.findUserByMethodAndContact(
          method,
          contact,
        );
        if (existingUser) {
          user = existingUser;
        } else {
          throw new BadRequestException("Failed to create user");
        }
      }
    }

    let shouldSave = false;
    if (method === AuthMethod.PHONE && user.phone !== contact) {
      user.phone = contact;
      shouldSave = true;
    }
    if (
      syncExistingDisplayName &&
      preferredDisplayName &&
      user.displayName !== preferredDisplayName
    ) {
      user.displayName = preferredDisplayName;
      shouldSave = true;
    }
    if (telegramLink) {
      if (user.telegramChatId !== telegramLink.chatId) {
        user.telegramChatId = telegramLink.chatId;
        shouldSave = true;
      }
      if (user.telegramUsername !== telegramLink.username) {
        user.telegramUsername = telegramLink.username;
        shouldSave = true;
      }
    }

    if (shouldSave) {
      return this.usersRepository.save(user);
    }

    return user;
  }

  private findUserByMethodAndContact(
    method: AuthMethod,
    contact: string,
  ): Promise<UserEntity | null> {
    if (method === AuthMethod.PHONE) {
      return this.findPhoneUser(contact);
    }

    return this.usersRepository.findOneBy({ method, contact });
  }

  private async findPhoneUser(contact: string): Promise<UserEntity | null> {
    const userByPhone = await this.usersRepository.findOneBy({
      method: AuthMethod.PHONE,
      phone: contact,
    });
    if (userByPhone) {
      return userByPhone;
    }

    return this.usersRepository.findOneBy({
      method: AuthMethod.PHONE,
      contact,
    });
  }

  private async buildAuthResult(user: UserEntity): Promise<AuthResult> {
    const token = await this.jwtService.signAsync(
      {
        sub: user.id,
        login: user.login ?? user.contact,
        displayName: user.displayName,
        contact: user.contact,
        method: user.method,
        phone: user.phone ?? user.contact,
      },
      {
        secret: getJwtSecret(),
        expiresIn: getJwtExpiresIn() as never,
      },
    );

    return {
      token,
      userID: user.id,
      login: user.login ?? user.contact,
      displayName: user.displayName,
      phone: user.phone ?? user.contact,
    };
  }

  private async authenticateUserByLogin(
    login: string,
    password: string,
  ): Promise<UserEntity> {
    if (!isPasswordLoginEnabled()) {
      throw new ForbiddenException("Password login is disabled");
    }

    const normalizedLogin = this.normalizeLogin(login);
    const user = await this.usersRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.login = :login", { login: normalizedLogin })
      .getOne();

    if (!user?.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordMatches = await compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return user;
  }

  async hashPassword(password: string): Promise<string> {
    return hash(password, 12);
  }

  normalizeLogin(login: string): string {
    const normalizedLogin = login.trim().toLowerCase();
    if (normalizedLogin.length < 3) {
      throw new BadRequestException("Login must contain at least 3 characters");
    }
    return normalizedLogin;
  }

  private generateVerificationCode(): string {
    if (isTestCodeAllowed()) {
      return getAuthTestCode();
    }

    return String(randomInt(100000, 999999));
  }

  private resolvePhone(dto: {
    phone?: string;
    contact?: string;
    method?: AuthMethod;
  }): string {
    const method = dto.method ?? AuthMethod.PHONE;
    if (method !== AuthMethod.PHONE) {
      throw new BadRequestException("Only phone authentication is supported");
    }

    return normalizePhone(dto.phone ?? dto.contact ?? "");
  }

  private resolveContact(dto: {
    phone?: string;
    contact?: string;
    method?: AuthMethod;
  }): string {
    const method = dto.method ?? AuthMethod.PHONE;
    const contact = dto.phone ?? dto.contact ?? "";
    return normalizeContact(method, contact);
  }

  private hashVerificationCode(phone: string, code: string): string {
    return createHmac("sha256", getJwtSecret())
      .update(`${phone}:${code}`)
      .digest("hex");
  }

  private findLatestCode(
    phone: string,
  ): Promise<PhoneVerificationCodeEntity | null> {
    return this.verificationCodesRepository.findOne({
      where: { phone },
      order: { createdAt: "DESC" },
    });
  }
}
