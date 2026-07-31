import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { SessionPlatform } from "../../entities/auth-session.entity";
import { isProductionEnv } from "../common/runtime-config";
import { SessionRequestContext } from "./session.types";

const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const DEVICE_NAME_PATTERN = /^[\p{L}\p{N} ._()/-]{1,128}$/u;

type RequestWithCookies = Request & {
  cookies?: Record<string, unknown>;
};

export function buildSessionRequestContext(
  request: RequestWithCookies,
): SessionRequestContext {
  const platform = getSessionPlatform(request);
  if (platform === SessionPlatform.UNKNOWN && isProductionEnv()) {
    throw new BadRequestException("X-Client-Platform is required");
  }
  const suppliedDeviceId = getSingleHeader(request, "x-device-id");
  const cookieDeviceId = readCookie(request, "mm_device");
  const deviceUuid = suppliedDeviceId ?? cookieDeviceId ?? randomUUID();

  if (!DEVICE_ID_PATTERN.test(deviceUuid)) {
    throw new BadRequestException("Invalid device identifier");
  }
  if (platform === SessionPlatform.IOS && !suppliedDeviceId) {
    throw new BadRequestException("X-Device-ID is required for iOS clients");
  }

  const suppliedDeviceName = getSingleHeader(request, "x-device-name");
  const fallbackName =
    platform === SessionPlatform.IOS
      ? "Mobile Messenger iOS"
      : platform === SessionPlatform.WEB
        ? "Mobile Messenger Web"
        : "Unknown client";
  const deviceName = suppliedDeviceName ?? fallbackName;
  if (!DEVICE_NAME_PATTERN.test(deviceName)) {
    throw new BadRequestException("Invalid device name");
  }

  return {
    deviceUuid,
    deviceName,
    platform,
    ipAddress: getRequestIp(request),
    userAgent: getSingleHeader(request, "user-agent"),
  };
}

export function getSessionPlatform(request: Request): SessionPlatform {
  const value = getSingleHeader(request, "x-client-platform")?.toLowerCase();
  switch (value) {
    case "ios":
      return SessionPlatform.IOS;
    case "cli":
      return SessionPlatform.CLI;
    case "web":
      return SessionPlatform.WEB;
    default:
      return SessionPlatform.UNKNOWN;
  }
}

export function getRefreshTokenFromRequest(
  request: RequestWithCookies,
  cookieName: string,
  bodyToken?: string,
): string | null {
  if (getSessionPlatform(request) !== SessionPlatform.WEB && bodyToken) {
    return bodyToken;
  }
  return readCookie(request, cookieName) ?? bodyToken ?? null;
}

export function getAccessTokenFromRequest(
  request: Pick<Request, "headers">,
  cookieName: string,
): string | null {
  const authorization = getSingleHeader(request, "authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice(7).trim() || null;
  }
  return readCookie(request as RequestWithCookies, cookieName);
}

export function readCookie(
  request: RequestWithCookies,
  name: string,
): string | null {
  const parsedCookie = request.cookies?.[name];
  if (typeof parsedCookie === "string" && parsedCookie) {
    return parsedCookie;
  }

  const cookieHeader = getSingleHeader(request, "cookie");
  if (!cookieHeader) {
    return null;
  }
  for (const pair of cookieHeader.split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const key = pair.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }
    const value = pair.slice(separatorIndex + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function getSingleHeader(
  request: Pick<Request, "headers">,
  name: string,
): string | null {
  const value = request.headers[name];
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }
  return typeof value === "string" ? value.trim() || null : null;
}

function getRequestIp(request: Request): string | null {
  return request.ip?.trim() || request.socket.remoteAddress?.trim() || null;
}
