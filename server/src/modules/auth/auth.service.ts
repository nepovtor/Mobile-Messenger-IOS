import { MatrixRevocationWorker } from "../matrix/matrix-revocation.worker";
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
import { compare as compareBcrypt } from "bcryptjs";
import { argon2id, hash as argon2Hash, verify as argon2Verify } from "argon2";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, IsNull, Repository } from "typeorm";
import { SessionPrincipalType } from "../../entities/auth-session.entity";
import { PhoneVerificationCodeEntity } from "../../entities/phone-verification-code.entity";
import {
  TelegramLinkEntity,
  TelegramLinkState,
} from "../../entities/telegram-link.entity";
import { AuthMethod, UserEntity, UserStatus } from "../../entities/user.entity";
import {
  SecurityActorType,
  SecurityAuditOutcome,
} from "../../entities/security-audit-event.entity";
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
  getLogIpHashKey,
  getOtpPepper,
  getPhoneRequestRateLimitMaxRequests,
  getVerificationProvider,
  isPasswordLoginEnabled,
  isTestCodeAllowed,
  shouldExposeDebugAuthCode,
} from "../common/runtime-config";
import { SecurityAuditService } from "../security/security-audit.service";
import { SessionService } from "../sessions/session.service";
import {
  IssuedSession,
  SessionRequestContext,
} from "../sessions/session.types";
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

export type AuthResult = {
  token: string;
  refreshToken: string;
  accessExpiresIn: string;
  refreshExpiresAt: Date;
  sessionId: string;
  deviceUuid: string;
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
    private readonly dataSource: DataSource,
    private readonly matrixRevocations: MatrixRevocationWorker,
    private readonly sessionService: SessionService,
    private readonly securityAuditService: SecurityAuditService,
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
    requestContext: SessionRequestContext,
  ): Promise<{
    status: "code_sent";
    delivery: string;
    resendAfterSeconds: number;
    expiresIn: number;
    debugCode?: string;
  }> {
    const phone = this.resolvePhone(dto);
    this.authRateLimitService.consume(
      `request:phone:${this.hashRateLimitValue(phone)}`,
      {
        maxRequests: getPhoneRequestRateLimitMaxRequests(),
        windowMs: getAuthRateLimitWindowMs(),
        message: "Too many auth requests for this phone number",
      },
    );
    this.authRateLimitService.consume(
      `request:device:${this.hashRateLimitValue(requestContext.deviceUuid)}`,
      {
        maxRequests: getPhoneRequestRateLimitMaxRequests() * 2,
        windowMs: getAuthRateLimitWindowMs(),
        message: "Too many auth requests for this device",
      },
    );

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
      requestIPHash: this.hashContextValue(requestContext.ipAddress),
      deviceIdentifierHash: this.hashContextValue(requestContext.deviceUuid),
    });

    await this.verificationCodesRepository.save(codeEntity);

    try {
      await this.smsService.sendVerificationCode(phone, code);
    } catch (error) {
      await this.verificationCodesRepository.delete({ id: codeEntity.id });
      if (error instanceof TelegramNotLinkedError) {
        return {
          status: "code_sent",
          delivery: getVerificationProvider(),
          resendAfterSeconds: this.resendCooldownSeconds,
          expiresIn: this.codeTTLSeconds,
        };
      }
      if (error instanceof SmsProviderUnavailableError) {
        throw new ServiceUnavailableException(
          "Verification provider unavailable",
        );
      }

      this.logger.error("Failed to deliver verification code", error as Error);
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

  async verifyCode(
    dto: VerifyAuthDto,
    requestContext: SessionRequestContext,
  ): Promise<AuthResult> {
    const user = await this.verifyCodeIdentity(dto);
    return this.buildAuthResult(user, requestContext);
  }

  async verifyCodeForOidc(
    dto: VerifyAuthDto,
    requestContext: SessionRequestContext,
  ): Promise<{ subject: string; authTime: number }> {
    const user = await this.verifyCodeIdentity(dto);
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException("Account is not active");
    }
    await this.matrixRevocations.admitFreshLogin(user.id);
    const authenticatedAt = new Date();
    await this.recordAuthenticationTime(user, authenticatedAt);
    await this.recordLogin(
      user,
      requestContext,
      SecurityAuditOutcome.SUCCESS,
      "oidc",
    );
    return {
      subject: user.id.toLowerCase(),
      authTime: Math.floor(authenticatedAt.getTime() / 1000),
    };
  }

  async getOidcAccount(
    subject: string,
  ): Promise<{ subject: string; notBefore?: number }> {
    const user = await this.usersRepository.findOneBy({
      id: subject.toLowerCase() as UserEntity["id"],
      status: UserStatus.ACTIVE,
    });
    if (!user) {
      throw new UnauthorizedException("Account is not active");
    }
    await this.matrixRevocations.requireSettled(user.id);
    const notBefore = await this.matrixRevocations.authenticationNotBefore(
      user.id,
    );
    return {
      subject: user.id.toLowerCase(),
      ...(notBefore === null ? {} : { notBefore }),
    };
  }

  private async verifyCodeIdentity(dto: VerifyAuthDto): Promise<UserEntity> {
    const phone = this.resolvePhone(dto);
    await this.consumeVerificationCode(phone, dto.code.trim());
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

    return user;
  }

  async login(
    dto: LoginAuthDto,
    requestContext: SessionRequestContext,
  ): Promise<AuthResult> {
    if (dto.login?.trim()) {
      const user = await this.authenticateUserByLogin(dto.login, dto.password);
      return this.buildAuthResult(user, requestContext);
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

    return this.buildAuthResult(user, requestContext);
  }

  async loginLabUser(
    dto: LabLoginDto,
    requestContext: SessionRequestContext,
  ): Promise<AuthResult> {
    const user = await this.authenticateUserByLogin(dto.login, dto.password);
    return this.buildAuthResult(user, requestContext);
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

  async refreshSession(
    refreshToken: string,
    requestContext: SessionRequestContext,
  ): Promise<AuthResult> {
    const identity = await this.sessionService.resolveRefreshPrincipal(
      refreshToken,
      SessionPrincipalType.USER,
    );
    const user = await this.usersRepository.findOneBy({
      id: identity.principalId as UserEntity["id"],
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Session is no longer valid");
    }
    const issued = await this.sessionService.rotateSession(
      refreshToken,
      SessionPrincipalType.USER,
      user.sessionVersion,
      requestContext,
    );
    return {
      ...this.toTokenFields(issued),
      userID: user.id,
      login: user.login ?? user.contact,
      displayName: user.displayName,
      phone: user.phone ?? user.contact,
    };
  }

  async logoutSession(user: { sub: string; sid: string }): Promise<void> {
    await this.sessionService.revokeSession(
      SessionPrincipalType.USER,
      user.sub,
      user.sid,
      "logout",
    );
  }

  async logoutWithRefreshToken(refreshToken: string | null): Promise<void> {
    if (!refreshToken) {
      return;
    }
    await this.sessionService.revokeByRefreshToken(
      refreshToken,
      SessionPrincipalType.USER,
      "logout",
    );
  }

  listSessions(user: { sub: string; sid: string }) {
    return this.sessionService.listSessions(
      SessionPrincipalType.USER,
      user.sub,
      user.sid,
    );
  }

  async revokeSession(
    user: { sub: string; sid: string },
    sessionId: string,
  ): Promise<{ revoked: true }> {
    const revoked = await this.sessionService.revokeSession(
      SessionPrincipalType.USER,
      user.sub,
      sessionId,
      "user_revoked",
    );
    if (!revoked) {
      throw new BadRequestException("Session not found");
    }
    return { revoked: true };
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

    const updates: Partial<UserEntity> = {};
    if (method === AuthMethod.PHONE && user.phone !== contact) {
      updates.phone = contact;
    }
    if (
      syncExistingDisplayName &&
      preferredDisplayName &&
      user.displayName !== preferredDisplayName
    ) {
      updates.displayName = preferredDisplayName;
    }
    if (telegramLink) {
      if (user.telegramChatId !== telegramLink.chatId) {
        updates.telegramChatId = telegramLink.chatId;
      }
      if (user.telegramUsername !== telegramLink.username) {
        updates.telegramUsername = telegramLink.username;
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.usersRepository.update({ id: user.id }, updates);
      Object.assign(user, updates);
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

  private async buildAuthResult(
    user: UserEntity,
    requestContext: SessionRequestContext,
  ): Promise<AuthResult> {
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException("Account is not active");
    }
    await this.recordAuthenticationTime(user, new Date());
    const issued = await this.sessionService.issueSession(
      SessionPrincipalType.USER,
      user.id,
      user.sessionVersion,
      requestContext,
    );
    await this.recordLogin(user, requestContext, SecurityAuditOutcome.SUCCESS);

    return {
      ...this.toTokenFields(issued),
      userID: user.id,
      login: user.login ?? user.contact,
      displayName: user.displayName,
      phone: user.phone ?? user.contact,
    };
  }

  private async recordAuthenticationTime(
    user: UserEntity,
    authenticatedAt: Date,
  ): Promise<void> {
    // Never save a loaded account snapshot: a concurrent administrator may
    // have blocked it after identity verification. Update only the timestamp,
    // conditional on the account still being active at the database boundary.
    const updated = await this.usersRepository.update(
      { id: user.id, status: UserStatus.ACTIVE },
      { lastLoginAt: authenticatedAt },
    );
    if (updated.affected !== 1) {
      throw new ForbiddenException("Account is not active");
    }
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

    const passwordMatches = await this.verifyUserPassword(
      user.passwordHash,
      password,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException("Account is not active");
    }
    if (user.passwordHash.startsWith("$2")) {
      const migratedPasswordHash = await this.hashPassword(password);
      const updated = await this.usersRepository.update(
        {
          id: user.id,
          status: UserStatus.ACTIVE,
          passwordHash: user.passwordHash,
        },
        { passwordHash: migratedPasswordHash },
      );
      if (updated.affected !== 1) {
        throw new UnauthorizedException("Account credentials changed");
      }
      user.passwordHash = migratedPasswordHash;
    }

    return user;
  }

  async hashPassword(password: string): Promise<string> {
    return argon2Hash(password, {
      type: argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
    });
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
    return createHmac("sha256", getOtpPepper())
      .update(`${phone}:${code}`)
      .digest("hex");
  }

  private async consumeVerificationCode(
    phone: string,
    submittedCode: string,
  ): Promise<void> {
    const result = await this.dataSource.transaction<
      "consumed" | "invalid" | "expired" | "used" | "limited" | "missing"
    >(async (manager) => {
      const repository = manager.getRepository(PhoneVerificationCodeEntity);
      const verificationCode = await repository.findOne({
        where: { phone },
        order: { createdAt: "DESC" },
        lock: { mode: "pessimistic_write" },
      });
      if (!verificationCode) {
        return "missing";
      }
      if (verificationCode.consumedAt) {
        return "used";
      }
      if (verificationCode.expiresAt.getTime() < Date.now()) {
        return "expired";
      }
      if (verificationCode.attempts >= this.codeMaxAttempts) {
        return "limited";
      }
      if (
        this.hashVerificationCode(phone, submittedCode) !==
        verificationCode.codeHash
      ) {
        verificationCode.attempts += 1;
        await repository.save(verificationCode);
        return verificationCode.attempts >= this.codeMaxAttempts
          ? "limited"
          : "invalid";
      }

      verificationCode.consumedAt = new Date();
      await repository.save(verificationCode);
      return "consumed";
    });

    switch (result) {
      case "consumed":
        return;
      case "limited":
        throw new HttpException(
          "Too many verification attempts",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case "expired":
        throw new UnauthorizedException("Verification code expired");
      case "used":
        throw new UnauthorizedException(
          "Verification code has already been used",
        );
      case "invalid":
      case "missing":
        throw new UnauthorizedException("Invalid verification code");
    }
  }

  private async verifyUserPassword(
    encodedHash: string,
    password: string,
  ): Promise<boolean> {
    try {
      if (encodedHash.startsWith("$argon2id$")) {
        return await argon2Verify(encodedHash, password);
      }
      if (encodedHash.startsWith("$2")) {
        return await compareBcrypt(password, encodedHash);
      }
      return false;
    } catch {
      return false;
    }
  }

  private toTokenFields(
    issued: IssuedSession,
  ): Pick<
    AuthResult,
    | "token"
    | "refreshToken"
    | "accessExpiresIn"
    | "refreshExpiresAt"
    | "sessionId"
    | "deviceUuid"
  > {
    return {
      token: issued.accessToken,
      refreshToken: issued.refreshToken,
      accessExpiresIn: issued.accessExpiresIn,
      refreshExpiresAt: issued.refreshExpiresAt,
      sessionId: issued.sessionId,
      deviceUuid: issued.deviceUuid,
    };
  }

  private hashRateLimitValue(value: string): string {
    return createHmac("sha256", getOtpPepper()).update(value).digest("hex");
  }

  private hashContextValue(value: string | null): string | null {
    if (!value) {
      return null;
    }
    return createHmac("sha256", getLogIpHashKey() ?? getOtpPepper())
      .update(value)
      .digest("hex");
  }

  private async recordLogin(
    user: UserEntity,
    context: SessionRequestContext,
    outcome: SecurityAuditOutcome,
    authenticationTransport?: "oidc",
  ): Promise<void> {
    await this.securityAuditService.record({
      eventType: "auth.user.login",
      actorType: SecurityActorType.USER,
      actorId: user.id,
      outcome,
      ipHash: this.hashContextValue(context.ipAddress),
      metadata: {
        method: user.method,
        platform: context.platform,
        ...(authenticationTransport ? { authenticationTransport } : {}),
      },
    });
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
