import type { Response } from "express";
import { SessionPrincipalType } from "../../entities/auth-session.entity";
import {
  getCookieSameSite,
  isCookieSecure,
  parseDurationSeconds,
} from "../common/runtime-config";
import { IssuedSession } from "./session.types";

export const USER_ACCESS_COOKIE = "mm_access";
export const USER_REFRESH_COOKIE = "mm_refresh";
export const ADMIN_ACCESS_COOKIE = "mm_admin_access";
export const ADMIN_REFRESH_COOKIE = "mm_admin_refresh";
export const DEVICE_COOKIE = "mm_device";

export function setSessionCookies(
  response: Response,
  principalType: SessionPrincipalType,
  issued: IssuedSession,
): void {
  const accessCookie =
    principalType === SessionPrincipalType.ADMIN
      ? ADMIN_ACCESS_COOKIE
      : USER_ACCESS_COOKIE;
  const refreshCookie =
    principalType === SessionPrincipalType.ADMIN
      ? ADMIN_REFRESH_COOKIE
      : USER_REFRESH_COOKIE;
  const refreshPath =
    principalType === SessionPrincipalType.ADMIN ? "/api/admin" : "/api/auth";
  const accessMaxAge = parseDurationSeconds(issued.accessExpiresIn) ?? 10 * 60;
  const refreshMaxAge = Math.max(
    0,
    Math.floor((issued.refreshExpiresAt.getTime() - Date.now()) / 1000),
  );

  response.cookie(accessCookie, issued.accessToken, {
    httpOnly: true,
    maxAge: accessMaxAge * 1000,
    path: "/api",
    sameSite: getCookieSameSite(),
    secure: isCookieSecure(),
  });
  response.cookie(refreshCookie, issued.refreshToken, {
    httpOnly: true,
    maxAge: refreshMaxAge * 1000,
    path: refreshPath,
    sameSite: getCookieSameSite(),
    secure: isCookieSecure(),
  });
  response.cookie(DEVICE_COOKIE, issued.deviceUuid, {
    httpOnly: true,
    maxAge: refreshMaxAge * 1000,
    path: "/api",
    sameSite: getCookieSameSite(),
    secure: isCookieSecure(),
  });
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
}

export function clearSessionCookies(
  response: Response,
  principalType: SessionPrincipalType,
): void {
  const accessCookie =
    principalType === SessionPrincipalType.ADMIN
      ? ADMIN_ACCESS_COOKIE
      : USER_ACCESS_COOKIE;
  const refreshCookie =
    principalType === SessionPrincipalType.ADMIN
      ? ADMIN_REFRESH_COOKIE
      : USER_REFRESH_COOKIE;
  const refreshPath =
    principalType === SessionPrincipalType.ADMIN ? "/api/admin" : "/api/auth";
  const options = {
    httpOnly: true,
    sameSite: getCookieSameSite(),
    secure: isCookieSecure(),
  } as const;

  response.clearCookie(accessCookie, { ...options, path: "/api" });
  response.clearCookie(refreshCookie, { ...options, path: refreshPath });
  response.clearCookie(DEVICE_COOKIE, { ...options, path: "/api" });
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
}
