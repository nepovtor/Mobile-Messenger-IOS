import { Body, Controller, Header, Post, UseGuards } from "@nestjs/common";
import { SessionPlatform } from "../../entities/auth-session.entity";
import { SessionRequestContext } from "../sessions/session.types";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthService } from "./auth.service";
import { Public } from "./decorators/public.decorator";
import {
  OidcBridgeAccountDto,
  OidcBridgeRequestDto,
  OidcBridgeVerifyDto,
} from "./dto/oidc-bridge.dto";
import { OidcBridgeGuard } from "./oidc-bridge.guard";

@Controller("auth/oidc")
@Public()
@UseGuards(OidcBridgeGuard)
export class OidcBridgeController {
  constructor(
    private readonly authService: AuthService,
    private readonly authRateLimitService: AuthRateLimitService,
  ) {}

  @Post("request")
  @Header("Cache-Control", "no-store")
  async requestCode(@Body() dto: OidcBridgeRequestDto) {
    const context = bridgeContext(dto);
    this.authRateLimitService.consume(`request:${context.ipAddress}`, {
      message: "Too many auth requests",
    });
    const result = await this.authService.requestCode(
      { phone: dto.phone },
      context,
    );
    // Development OTPs must never be disclosed to the OIDC client either.
    return {
      status: result.status,
      delivery: result.delivery,
      resendAfterSeconds: result.resendAfterSeconds,
      expiresIn: result.expiresIn,
    };
  }

  @Post("verify")
  @Header("Cache-Control", "no-store")
  verifyCode(@Body() dto: OidcBridgeVerifyDto) {
    const context = bridgeContext(dto);
    this.authRateLimitService.consume(`verify:${context.deviceUuid}`, {
      maxRequests: 10,
      message: "Too many auth attempts",
    });
    return this.authService.verifyCodeForOidc(
      { phone: dto.phone, code: dto.code },
      context,
    );
  }

  @Post("account")
  @Header("Cache-Control", "no-store")
  account(@Body() dto: OidcBridgeAccountDto) {
    return this.authService.getOidcAccount(dto.subject);
  }
}

function bridgeContext(dto: OidcBridgeRequestDto): SessionRequestContext {
  // Only the authenticated bridge may supply this context. Its device ID is
  // generated once per browser session and IP comes from its trusted proxy.
  return {
    deviceUuid: dto.deviceUuid.toLowerCase(),
    deviceName: "Mobile Messenger OIDC",
    platform: SessionPlatform.WEB,
    ipAddress: dto.ipAddress,
    userAgent: null,
  };
}
