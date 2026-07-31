import {
  SessionPlatform,
  SessionPrincipalType,
} from "../../entities/auth-session.entity";

export type SessionRequestContext = {
  deviceUuid: string;
  deviceName: string;
  platform: SessionPlatform;
  ipAddress: string | null;
  userAgent: string | null;
};

export type AccessTokenClaims = {
  sub: string;
  sid: string;
  jti: string;
  typ: "access";
  role: SessionPrincipalType;
  sv: number;
  iat?: number;
  nbf?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
};

export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: string;
  refreshExpiresAt: Date;
  sessionId: string;
  deviceUuid: string;
};

export type SessionProfile = {
  id: string;
  deviceUuid: string;
  deviceName: string;
  platform: SessionPlatform;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  current: boolean;
};
