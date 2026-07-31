import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AdminEntity } from "../../entities/admin.entity";
import { SessionPrincipalType } from "../../entities/auth-session.entity";
import {
  SecurityActorType,
  SecurityAuditOutcome,
} from "../../entities/security-audit-event.entity";
import { AuthenticatedAdmin } from "../common/authenticated-admin";
import {
  getAdminIpAllowlist,
  getLogIpHashKey,
  getRefreshTokenPepper,
  isAdminIpAllowlistEnabled,
} from "../common/runtime-config";
import {
  hashAdministrativePassword,
  verifyAdministrativePassword,
} from "../common/password";
import { SecurityAuditService } from "../security/security-audit.service";
import { SessionService } from "../sessions/session.service";
import {
  IssuedSession,
  SessionRequestContext,
} from "../sessions/session.types";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { AdminRateLimitService } from "./admin-rate-limit.service";

const DUMMY_HASH = hashAdministrativePassword("Never-Valid-Admin!2026");

export type AdminAuthResult = {
  token: string;
  refreshToken: string;
  accessExpiresIn: string;
  refreshExpiresAt: Date;
  sessionId: string;
  deviceUuid: string;
  admin: {
    login: string;
    role: "admin";
    displayName: string;
    lastLoginAt: Date | null;
    mfaMethod: "none" | "totp";
  };
};

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AdminEntity)
    private readonly adminsRepository: Repository<AdminEntity>,
    private readonly sessionService: SessionService,
    private readonly securityAuditService: SecurityAuditService,
    private readonly rateLimitService: AdminRateLimitService,
  ) {}

  async login(
    dto: AdminLoginDto,
    context: SessionRequestContext,
  ): Promise<AdminAuthResult> {
    this.requireAllowedIp(context.ipAddress);
    const normalizedLogin = dto.login.trim().toLowerCase();
    this.rateLimitService.consume(
      `${this.hashValue(context.ipAddress ?? "unknown")}:${this.hashValue(normalizedLogin)}`,
    );
    const admin = await this.adminsRepository
      .createQueryBuilder("admin")
      .addSelect("admin.passwordHash")
      .where("admin.login = :login", { login: normalizedLogin })
      .getOne();

    const passwordMatches = await verifyAdministrativePassword(
      admin?.passwordHash ?? (await DUMMY_HASH),
      dto.password,
    );
    if (!admin || !passwordMatches) {
      let failedAttempts = 1;
      if (admin) {
        failedAttempts = await this.recordFailedAttempt(admin);
      }
      await this.recordLoginAudit(
        admin?.id ?? null,
        context,
        SecurityAuditOutcome.FAILURE,
      );
      await delay(Math.min(failedAttempts * 100, 2_000));
      throw new UnauthorizedException("Invalid admin credentials");
    }

    const now = new Date();
    if (
      !admin.isActive ||
      admin.deactivatedAt ||
      (admin.lockedUntil && admin.lockedUntil.getTime() > now.getTime())
    ) {
      await this.recordLoginAudit(
        admin.id,
        context,
        SecurityAuditOutcome.DENIED,
      );
      throw new ForbiddenException("Admin account is not available");
    }
    if (admin.mfaMethod !== "none") {
      await this.recordLoginAudit(
        admin.id,
        context,
        SecurityAuditOutcome.DENIED,
      );
      throw new ForbiddenException("MFA challenge is required");
    }

    admin.failedLoginAttempts = 0;
    admin.lockedUntil = null;
    admin.lastLoginAt = now;
    await this.adminsRepository.save(admin);
    const issued = await this.sessionService.issueSession(
      SessionPrincipalType.ADMIN,
      admin.id,
      admin.sessionVersion,
      context,
    );
    await this.recordLoginAudit(
      admin.id,
      context,
      SecurityAuditOutcome.SUCCESS,
    );
    return this.buildLoginResponse(admin, issued);
  }

  async refreshSession(
    refreshToken: string,
    context: SessionRequestContext,
  ): Promise<AdminAuthResult> {
    this.requireAllowedIp(context.ipAddress);
    const identity = await this.sessionService.resolveRefreshPrincipal(
      refreshToken,
      SessionPrincipalType.ADMIN,
    );
    const admin = await this.adminsRepository.findOneBy({
      id: identity.principalId as AdminEntity["id"],
    });
    if (!admin || !admin.isActive || admin.deactivatedAt) {
      throw new UnauthorizedException("Session is no longer valid");
    }
    const issued = await this.sessionService.rotateSession(
      refreshToken,
      SessionPrincipalType.ADMIN,
      admin.sessionVersion,
      context,
    );
    return this.buildLoginResponse(admin, issued);
  }

  async getMe(adminContext: AuthenticatedAdmin) {
    const admin = await this.adminsRepository.findOneBy({
      id: adminContext.sub as AdminEntity["id"],
    });
    if (!admin || !admin.isActive || admin.deactivatedAt) {
      throw new UnauthorizedException("Admin account is not available");
    }
    return this.toProfile(admin);
  }

  async logoutWithRefreshToken(refreshToken: string | null): Promise<void> {
    if (!refreshToken) {
      return;
    }
    await this.sessionService.revokeByRefreshToken(
      refreshToken,
      SessionPrincipalType.ADMIN,
      "logout",
    );
  }

  listSessions(admin: AuthenticatedAdmin) {
    return this.sessionService.listSessions(
      SessionPrincipalType.ADMIN,
      admin.sub,
      admin.sid,
    );
  }

  async revokeSession(
    admin: AuthenticatedAdmin,
    sessionId: string,
  ): Promise<{ revoked: boolean }> {
    const revoked = await this.sessionService.revokeSession(
      SessionPrincipalType.ADMIN,
      admin.sub,
      sessionId,
      "admin_revoked",
    );
    return { revoked };
  }

  private async recordFailedAttempt(admin: AdminEntity): Promise<number> {
    admin.failedLoginAttempts += 1;
    if (admin.failedLoginAttempts >= 5) {
      const lockSeconds = Math.min(
        15 * 60,
        30 * 2 ** Math.min(admin.failedLoginAttempts - 5, 5),
      );
      admin.lockedUntil = new Date(Date.now() + lockSeconds * 1000);
    }
    await this.adminsRepository.save(admin);
    return admin.failedLoginAttempts;
  }

  private buildLoginResponse(
    admin: AdminEntity,
    issued: IssuedSession,
  ): AdminAuthResult {
    return {
      token: issued.accessToken,
      refreshToken: issued.refreshToken,
      accessExpiresIn: issued.accessExpiresIn,
      refreshExpiresAt: issued.refreshExpiresAt,
      sessionId: issued.sessionId,
      deviceUuid: issued.deviceUuid,
      admin: this.toProfile(admin),
    };
  }

  private toProfile(admin: AdminEntity) {
    return {
      login: admin.login,
      role: "admin" as const,
      displayName: admin.displayName,
      lastLoginAt: admin.lastLoginAt,
      mfaMethod: admin.mfaMethod,
    };
  }

  private requireAllowedIp(ipAddress: string | null): void {
    if (!isAdminIpAllowlistEnabled()) {
      return;
    }
    const normalizedIp = normalizeIp(ipAddress);
    if (
      !normalizedIp ||
      !getAdminIpAllowlist().some((allowed) => ipMatches(allowed, normalizedIp))
    ) {
      throw new ForbiddenException("Admin access is not allowed");
    }
  }

  private hashValue(value: string): string {
    return createHmac("sha256", getLogIpHashKey() ?? getRefreshTokenPepper())
      .update(value)
      .digest("hex");
  }

  private async recordLoginAudit(
    adminId: string | null,
    context: SessionRequestContext,
    outcome: SecurityAuditOutcome,
  ): Promise<void> {
    await this.securityAuditService.record({
      eventType: "auth.admin.login",
      actorType: adminId
        ? SecurityActorType.ADMIN
        : SecurityActorType.ANONYMOUS,
      actorId: adminId,
      outcome,
      ipHash: context.ipAddress ? this.hashValue(context.ipAddress) : null,
      metadata: { platform: context.platform },
    });
  }
}

function normalizeIp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.startsWith("::ffff:") ? value.slice(7) : value;
}

function ipMatches(allowlistEntry: string, address: string): boolean {
  const [network, prefixText] = allowlistEntry.split("/");
  if (!network || prefixText === undefined) {
    return normalizeIp(network ?? null) === address;
  }
  const prefix = Number(prefixText);
  if (
    !isIPv4(network) ||
    !isIPv4(address) ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  ) {
    return false;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToNumber(network) & mask) === (ipv4ToNumber(address) & mask);
}

function isIPv4(value: string): boolean {
  const octets = value.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => {
      const number = Number(octet);
      return /^\d{1,3}$/.test(octet) && number >= 0 && number <= 255;
    })
  );
}

function ipv4ToNumber(value: string): number {
  return value
    .split(".")
    .map(Number)
    .reduce((result, octet) => ((result << 8) | octet) >>> 0, 0);
}
