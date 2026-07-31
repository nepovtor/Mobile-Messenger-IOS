import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { DataSource, IsNull, Repository } from "typeorm";
import {
  AuthSessionEntity,
  SessionPrincipalType,
} from "../../entities/auth-session.entity";
import { RefreshTokenEntity } from "../../entities/refresh-token.entity";
import {
  getJwtAccessCurrentKeyId,
  getJwtAccessCurrentSecret,
  getJwtAccessPreviousKeyId,
  getJwtAccessPreviousSecret,
  getJwtAccessTokenExpiresIn,
  getJwtAudience,
  getJwtIssuer,
  getJwtRefreshTokenExpiresIn,
  getLogIpHashKey,
  getRefreshTokenPepper,
  parseDurationSeconds,
} from "../common/runtime-config";
import {
  SecurityActorType,
  SecurityAuditOutcome,
} from "../../entities/security-audit-event.entity";
import { SecurityAuditService } from "../security/security-audit.service";
import {
  AccessTokenClaims,
  IssuedSession,
  SessionProfile,
  SessionRequestContext,
} from "./session.types";

type RotationResult =
  | {
      status: "ok";
      session: AuthSessionEntity;
      refreshToken: string;
      refreshExpiresAt: Date;
    }
  | { status: "invalid" }
  | {
      status: "reuse";
      principalId: string;
      principalType: SessionPrincipalType;
    };

@Injectable()
export class SessionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly securityAuditService: SecurityAuditService,
    @InjectRepository(AuthSessionEntity)
    private readonly sessionsRepository: Repository<AuthSessionEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokensRepository: Repository<RefreshTokenEntity>,
  ) {}

  async issueSession(
    principalType: SessionPrincipalType,
    principalId: string,
    sessionVersion: number,
    context: SessionRequestContext,
  ): Promise<IssuedSession> {
    const now = new Date();
    const refreshExpiresAt = new Date(
      now.getTime() + this.refreshTtlSeconds() * 1000,
    );
    const session = this.sessionsRepository.create({
      principalType,
      principalId,
      deviceUuid: context.deviceUuid,
      deviceName: context.deviceName,
      platform: context.platform,
      ipHash: this.hashContextValue(context.ipAddress),
      userAgentHash: this.hashContextValue(context.userAgent),
      lastSeenAt: now,
      expiresAt: refreshExpiresAt,
      revokedAt: null,
      revokeReason: null,
    });
    const tokenMaterial = this.createRefreshToken();
    const refreshToken = this.refreshTokensRepository.create({
      id: tokenMaterial.id,
      sessionId: session.id,
      tokenFamilyId: session.tokenFamilyId,
      tokenHash: this.hashRefreshToken(tokenMaterial.value),
      parentTokenId: null,
      expiresAt: refreshExpiresAt,
      consumedAt: null,
      revokedAt: null,
      replacedByTokenId: null,
    });

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(AuthSessionEntity).save(session);
      await manager.getRepository(RefreshTokenEntity).save(refreshToken);
    });

    return {
      accessToken: await this.signAccessToken(
        principalType,
        principalId,
        session.id,
        sessionVersion,
      ),
      refreshToken: tokenMaterial.value,
      accessExpiresIn: getJwtAccessTokenExpiresIn(),
      refreshExpiresAt,
      sessionId: session.id,
      deviceUuid: session.deviceUuid,
    };
  }

  async rotateSession(
    refreshTokenValue: string,
    expectedPrincipalType: SessionPrincipalType,
    sessionVersion: number,
    context: SessionRequestContext,
  ): Promise<IssuedSession> {
    const parsed = this.parseRefreshToken(refreshTokenValue);
    if (!parsed) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const result = await this.dataSource.transaction<RotationResult>(
      async (manager) => {
        const refreshRepository = manager.getRepository(RefreshTokenEntity);
        const sessionsRepository = manager.getRepository(AuthSessionEntity);
        const token = await refreshRepository.findOne({
          where: { id: parsed.id },
          lock: { mode: "pessimistic_write" },
        });
        if (
          !token ||
          !this.refreshTokenMatches(refreshTokenValue, token.tokenHash)
        ) {
          return { status: "invalid" };
        }

        const session = await sessionsRepository.findOne({
          where: { id: token.sessionId },
          lock: { mode: "pessimistic_write" },
        });
        if (!session || session.principalType !== expectedPrincipalType) {
          return { status: "invalid" };
        }

        const now = new Date();
        if (token.consumedAt) {
          await this.revokeFamilyWithManager(
            sessionsRepository,
            refreshRepository,
            session,
            "refresh_token_reuse",
            now,
          );
          return {
            status: "reuse",
            principalId: session.principalId,
            principalType: session.principalType,
          };
        }
        if (token.revokedAt || session.revokedAt) {
          return { status: "invalid" };
        }
        if (
          token.expiresAt.getTime() <= now.getTime() ||
          session.expiresAt.getTime() <= now.getTime()
        ) {
          return { status: "invalid" };
        }

        const nextMaterial = this.createRefreshToken();
        const nextToken = refreshRepository.create({
          id: nextMaterial.id,
          sessionId: session.id,
          tokenFamilyId: session.tokenFamilyId,
          tokenHash: this.hashRefreshToken(nextMaterial.value),
          parentTokenId: token.id,
          expiresAt: session.expiresAt,
          consumedAt: null,
          revokedAt: null,
          replacedByTokenId: null,
        });
        token.consumedAt = now;
        token.replacedByTokenId = nextToken.id;
        session.lastSeenAt = now;
        session.ipHash = this.hashContextValue(context.ipAddress);
        session.userAgentHash = this.hashContextValue(context.userAgent);
        await refreshRepository.save([token, nextToken]);
        await sessionsRepository.save(session);
        return {
          status: "ok",
          session,
          refreshToken: nextMaterial.value,
          refreshExpiresAt: session.expiresAt,
        };
      },
    );

    if (result.status === "reuse") {
      await this.recordRefreshReuse(
        result.principalType,
        result.principalId,
        context,
      );
      throw new UnauthorizedException("Refresh token reuse detected");
    }
    if (result.status === "invalid") {
      throw new UnauthorizedException("Invalid refresh token");
    }

    return {
      accessToken: await this.signAccessToken(
        result.session.principalType,
        result.session.principalId,
        result.session.id,
        sessionVersion,
      ),
      refreshToken: result.refreshToken,
      accessExpiresIn: getJwtAccessTokenExpiresIn(),
      refreshExpiresAt: result.refreshExpiresAt,
      sessionId: result.session.id,
      deviceUuid: result.session.deviceUuid,
    };
  }

  async resolveRefreshPrincipal(
    refreshTokenValue: string,
    expectedPrincipalType: SessionPrincipalType,
  ): Promise<{ principalId: string; sessionId: string }> {
    const parsed = this.parseRefreshToken(refreshTokenValue);
    if (!parsed) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    const token = await this.refreshTokensRepository.findOneBy({
      id: parsed.id,
    });
    if (
      !token ||
      token.expiresAt.getTime() <= Date.now() ||
      !this.refreshTokenMatches(refreshTokenValue, token.tokenHash)
    ) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    const session = await this.sessionsRepository.findOneBy({
      id: token.sessionId,
      principalType: expectedPrincipalType,
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    return {
      principalId: session.principalId,
      sessionId: session.id,
    };
  }

  async revokeByRefreshToken(
    refreshTokenValue: string,
    expectedPrincipalType: SessionPrincipalType,
    reason: string,
  ): Promise<void> {
    try {
      const identity = await this.resolveRefreshPrincipal(
        refreshTokenValue,
        expectedPrincipalType,
      );
      await this.revokeSession(
        expectedPrincipalType,
        identity.principalId,
        identity.sessionId,
        reason,
      );
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) {
        throw error;
      }
    }
  }

  async verifyAccessToken(
    token: string,
    expectedPrincipalType: SessionPrincipalType,
  ): Promise<AccessTokenClaims> {
    const keyId = this.readJwtKeyId(token);
    const secret = this.resolveJwtSecret(keyId);
    if (!secret) {
      throw new UnauthorizedException("Invalid access token");
    }

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwtService.verifyAsync<AccessTokenClaims>(token, {
        algorithms: ["HS256"],
        audience: getJwtAudience(),
        issuer: getJwtIssuer(),
        secret,
      });
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
    if (
      claims.typ !== "access" ||
      claims.role !== expectedPrincipalType ||
      !claims.sub ||
      !claims.sid ||
      !claims.jti ||
      !Number.isInteger(claims.sv)
    ) {
      throw new UnauthorizedException("Invalid access token");
    }
    return claims;
  }

  async requireActiveSession(
    claims: AccessTokenClaims,
  ): Promise<AuthSessionEntity> {
    const session = await this.sessionsRepository.findOneBy({
      id: claims.sid,
      principalId: claims.sub,
      principalType: claims.role,
      revokedAt: IsNull(),
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Session is no longer active");
    }

    const staleThreshold = Date.now() - 60_000;
    if (session.lastSeenAt.getTime() < staleThreshold) {
      session.lastSeenAt = new Date();
      await this.sessionsRepository.save(session);
    }
    return session;
  }

  async revokeSession(
    principalType: SessionPrincipalType,
    principalId: string,
    sessionId: string,
    reason: string,
  ): Promise<boolean> {
    const session = await this.sessionsRepository.findOneBy({
      id: sessionId,
      principalType,
      principalId,
    });
    if (!session) {
      return false;
    }
    await this.revokeSessionEntity(session, reason);
    return true;
  }

  async revokeAllSessions(
    principalType: SessionPrincipalType,
    principalId: string,
    reason: string,
  ): Promise<void> {
    const sessions = await this.sessionsRepository.findBy({
      principalType,
      principalId,
      revokedAt: IsNull(),
    });
    for (const session of sessions) {
      await this.revokeSessionEntity(session, reason);
    }
  }

  async revokeSessionsForDevice(
    principalType: SessionPrincipalType,
    principalId: string,
    deviceUuid: string,
    reason: string,
  ): Promise<number> {
    const sessions = await this.sessionsRepository.findBy({
      principalType,
      principalId,
      deviceUuid,
      revokedAt: IsNull(),
    });
    for (const session of sessions) {
      await this.revokeSessionEntity(session, reason);
    }
    return sessions.length;
  }

  async listSessions(
    principalType: SessionPrincipalType,
    principalId: string,
    currentSessionId: string,
  ): Promise<SessionProfile[]> {
    const sessions = await this.sessionsRepository.find({
      where: {
        principalType,
        principalId,
        revokedAt: IsNull(),
      },
      order: { lastSeenAt: "DESC" },
    });
    return sessions
      .filter((session) => session.expiresAt.getTime() > Date.now())
      .map((session) => ({
        id: session.id,
        deviceUuid: session.deviceUuid,
        deviceName: session.deviceName,
        platform: session.platform,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        current: session.id === currentSessionId,
      }));
  }

  private async signAccessToken(
    principalType: SessionPrincipalType,
    principalId: string,
    sessionId: string,
    sessionVersion: number,
  ): Promise<string> {
    return this.jwtService.signAsync(
      {
        sid: sessionId,
        jti: randomUUID(),
        typ: "access",
        role: principalType,
        sv: Number(sessionVersion),
      },
      {
        algorithm: "HS256",
        audience: getJwtAudience(),
        expiresIn: getJwtAccessTokenExpiresIn() as never,
        issuer: getJwtIssuer(),
        keyid: getJwtAccessCurrentKeyId(),
        secret: getJwtAccessCurrentSecret(),
        subject: principalId,
      },
    );
  }

  private async revokeSessionEntity(
    session: AuthSessionEntity,
    reason: string,
  ): Promise<void> {
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      const sessionsRepository = manager.getRepository(AuthSessionEntity);
      const refreshRepository = manager.getRepository(RefreshTokenEntity);
      await this.revokeFamilyWithManager(
        sessionsRepository,
        refreshRepository,
        session,
        reason,
        now,
      );
    });
  }

  private async revokeFamilyWithManager(
    sessionsRepository: Repository<AuthSessionEntity>,
    refreshRepository: Repository<RefreshTokenEntity>,
    session: AuthSessionEntity,
    reason: string,
    now: Date,
  ): Promise<void> {
    session.revokedAt = session.revokedAt ?? now;
    session.revokeReason = reason.slice(0, 255);
    await sessionsRepository.save(session);
    await refreshRepository.update(
      {
        tokenFamilyId: session.tokenFamilyId,
        revokedAt: IsNull(),
      },
      { revokedAt: now },
    );
  }

  private createRefreshToken(): { id: string; value: string } {
    const id = randomUUID();
    return {
      id,
      value: `${id}.${randomBytes(32).toString("base64url")}`,
    };
  }

  private parseRefreshToken(value: string): { id: string } | null {
    const match =
      /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i.exec(
        value,
      );
    return match?.[1] ? { id: match[1] } : null;
  }

  private hashRefreshToken(value: string): string {
    return createHmac("sha256", getRefreshTokenPepper())
      .update(value)
      .digest("hex");
  }

  private refreshTokenMatches(value: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashRefreshToken(value), "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private hashContextValue(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const key = getLogIpHashKey() ?? getRefreshTokenPepper();
    return createHmac("sha256", key).update(value).digest("hex");
  }

  private readJwtKeyId(token: string): string | null {
    const encodedHeader = token.split(".")[0];
    if (!encodedHeader) {
      return null;
    }
    try {
      const decoded = JSON.parse(
        Buffer.from(encodedHeader, "base64url").toString("utf8"),
      ) as unknown;
      if (
        typeof decoded === "object" &&
        decoded !== null &&
        "kid" in decoded &&
        typeof decoded.kid === "string"
      ) {
        return decoded.kid;
      }
    } catch {
      return null;
    }
    return null;
  }

  private resolveJwtSecret(keyId: string | null): string | null {
    if (keyId === getJwtAccessCurrentKeyId()) {
      return getJwtAccessCurrentSecret();
    }
    const previousKeyId = getJwtAccessPreviousKeyId();
    const previousSecret = getJwtAccessPreviousSecret();
    return keyId && keyId === previousKeyId ? previousSecret : null;
  }

  private refreshTtlSeconds(): number {
    const seconds = parseDurationSeconds(getJwtRefreshTokenExpiresIn());
    if (!seconds) {
      throw new Error("JWT_REFRESH_EXPIRES_IN is invalid");
    }
    return seconds;
  }

  private async recordRefreshReuse(
    principalType: SessionPrincipalType,
    principalId: string,
    context: SessionRequestContext,
  ): Promise<void> {
    await this.securityAuditService.record({
      eventType: "auth.refresh.reuse_detected",
      actorType:
        principalType === SessionPrincipalType.ADMIN
          ? SecurityActorType.ADMIN
          : SecurityActorType.USER,
      actorId: principalId,
      outcome: SecurityAuditOutcome.DENIED,
      ipHash: this.hashContextValue(context.ipAddress),
      metadata: { principalType },
    });
  }
}
