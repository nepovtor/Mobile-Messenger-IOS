import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

/** A separate service credential: user JWTs and cookies never grant access. */
@Injectable()
export class OidcBridgeGuard implements CanActivate {
  private readonly sharedSecret = readBridgeSecret();

  canActivate(context: ExecutionContext): boolean {
    if (!this.sharedSecret) {
      throw new NotFoundException();
    }
    const request = context.switchToHttp().getRequest<Request>();
    // These are server-to-server endpoints. Do not accept browser requests,
    // even when CORS accidentally permits the bridge header.
    if (
      request.headers.origin !== undefined ||
      request.headers["sec-fetch-site"] !== undefined
    ) {
      throw new ForbiddenException("Server-to-server authentication required");
    }
    const supplied = request.headers["x-oidc-bridge-secret"];
    const candidate =
      typeof supplied === "string" ? decodeSecret(supplied) : null;
    if (!candidate || !timingSafeEqual(candidate, this.sharedSecret)) {
      throw new UnauthorizedException("Invalid bridge credentials");
    }
    return true;
  }
}

function readBridgeSecret(): Buffer | null {
  if (process.env["OIDC_BRIDGE_ENABLED"] !== "true") {
    return null;
  }
  return decodeSecret(process.env["OIDC_BRIDGE_SHARED_SECRET"] ?? "");
}

function decodeSecret(value: string): Buffer | null {
  // Require a canonical encoding of exactly 32 random bytes. Generate with
  // randomBytes(32).toString("base64url"); do not use a human password.
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    return null;
  }
  const bytes = Buffer.from(value, "base64url");
  return bytes.length === 32 && bytes.toString("base64url") === value
    ? bytes
    : null;
}
