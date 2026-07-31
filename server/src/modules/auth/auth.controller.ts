import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  SessionPlatform,
  SessionPrincipalType,
} from "../../entities/auth-session.entity";
import { AuthenticatedUser } from "../common/authenticated-user";
import {
  clearSessionCookies,
  setSessionCookies,
  USER_REFRESH_COOKIE,
} from "../sessions/session-cookies";
import {
  buildSessionRequestContext,
  getRefreshTokenFromRequest,
} from "../sessions/session-request";
import { RefreshSessionDto } from "../sessions/dto/refresh-session.dto";
import { AuthGuard } from "./auth.guard";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthResult, AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { LoginAuthDto } from "./dto/login-auth.dto";
import { RequestAuthDto } from "./dto/request-auth.dto";
import { RequestTelegramPairingDto } from "./dto/request-telegram-pairing.dto";
import { VerifyAuthDto } from "./dto/verify-auth.dto";
import { TelegramBotService } from "./telegram/telegram-bot.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authRateLimitService: AuthRateLimitService,
    private readonly telegramBotService: TelegramBotService,
  ) {}

  @Post("request")
  @Public()
  requestCode(@Req() request: Request, @Body() dto: RequestAuthDto) {
    const context = buildSessionRequestContext(request);
    this.authRateLimitService.consume(
      `request:${context.ipAddress ?? "unknown"}`,
      {
        message: "Too many auth requests",
      },
    );
    return this.authService.requestCode(dto, context);
  }

  @Post("verify")
  @Public()
  async verifyCode(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: VerifyAuthDto,
  ) {
    const context = buildSessionRequestContext(request);
    this.authRateLimitService.consume(`verify:${context.deviceUuid}`, {
      maxRequests: 10,
      message: "Too many auth attempts",
    });
    const result = await this.authService.verifyCode(dto, context);
    return this.presentAuthResult(response, context.platform, result);
  }

  @Post("login")
  @Public()
  async login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: LoginAuthDto,
  ) {
    const context = buildSessionRequestContext(request);
    this.authRateLimitService.consume(`login:${context.deviceUuid}`);
    const result = await this.authService.login(dto, context);
    return this.presentAuthResult(response, context.platform, result);
  }

  @Post("refresh")
  @Public()
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() dto?: RefreshSessionDto,
  ) {
    const context = buildSessionRequestContext(request);
    const refreshToken = getRefreshTokenFromRequest(
      request,
      USER_REFRESH_COOKIE,
      dto?.refreshToken,
    );
    if (!refreshToken) {
      clearSessionCookies(response, SessionPrincipalType.USER);
      throw new UnauthorizedException("Missing refresh token");
    }
    const result = await this.authService.refreshSession(refreshToken, context);
    return this.presentAuthResult(response, context.platform, result);
  }

  @Post("logout")
  @Public()
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() dto?: RefreshSessionDto,
  ): Promise<void> {
    const refreshToken = getRefreshTokenFromRequest(
      request,
      USER_REFRESH_COOKIE,
      dto?.refreshToken,
    );
    await this.authService.logoutWithRefreshToken(refreshToken);
    clearSessionCookies(response, SessionPrincipalType.USER);
  }

  @Post("telegram/pairing")
  @Public()
  createTelegramPairing(
    @Req() request: Request,
    @Body() dto: RequestTelegramPairingDto,
  ) {
    const context = buildSessionRequestContext(request);
    return this.telegramBotService.createPairingLink(dto.phone, {
      requestIP: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  @Get("me")
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.sub);
  }

  @Get("sessions")
  @UseGuards(AuthGuard)
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user);
  }

  @Delete("sessions/:sessionId")
  @UseGuards(AuthGuard)
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId", new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.authService.revokeSession(user, sessionId);
  }

  private presentAuthResult(
    response: Response,
    platform: SessionPlatform,
    result: AuthResult,
  ) {
    const {
      token,
      refreshToken,
      accessExpiresIn,
      refreshExpiresAt,
      sessionId,
      deviceUuid,
      ...profile
    } = result;
    if (platform === SessionPlatform.WEB) {
      setSessionCookies(response, SessionPrincipalType.USER, {
        accessToken: token,
        refreshToken,
        accessExpiresIn,
        refreshExpiresAt,
        sessionId,
        deviceUuid,
      });
      return profile;
    }

    response.setHeader("Cache-Control", "no-store");
    return {
      ...profile,
      token,
      refreshToken,
      expiresIn: accessExpiresIn,
      refreshExpiresAt,
      sessionId,
    };
  }
}
