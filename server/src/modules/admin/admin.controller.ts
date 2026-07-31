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
import { AuthenticatedAdmin } from "../common/authenticated-admin";
import { Public } from "../auth/decorators/public.decorator";
import { SkipUserAuth } from "../auth/decorators/skip-user-auth.decorator";
import {
  ADMIN_REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from "../sessions/session-cookies";
import { RefreshSessionDto } from "../sessions/dto/refresh-session.dto";
import {
  buildSessionRequestContext,
  getRefreshTokenFromRequest,
} from "../sessions/session-request";
import { AdminGuard } from "./admin.guard";
import { AdminService, AdminAuthResult } from "./admin.service";
import { AdminLoginDto } from "./dto/admin-login.dto";

@Controller("admin")
@SkipUserAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post("login")
  @Public()
  async login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: AdminLoginDto,
  ) {
    const context = buildSessionRequestContext(request);
    const result = await this.adminService.login(dto, context);
    return this.presentResult(response, context.platform, result);
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
      ADMIN_REFRESH_COOKIE,
      dto?.refreshToken,
    );
    if (!refreshToken) {
      clearSessionCookies(response, SessionPrincipalType.ADMIN);
      throw new UnauthorizedException("Missing refresh token");
    }
    const result = await this.adminService.refreshSession(
      refreshToken,
      context,
    );
    return this.presentResult(response, context.platform, result);
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
      ADMIN_REFRESH_COOKIE,
      dto?.refreshToken,
    );
    await this.adminService.logoutWithRefreshToken(refreshToken);
    clearSessionCookies(response, SessionPrincipalType.ADMIN);
  }

  @Get("me")
  @UseGuards(AdminGuard)
  getMe(@Req() request: Request & { admin: AuthenticatedAdmin }) {
    return this.adminService.getMe(request.admin);
  }

  @Get("sessions")
  @UseGuards(AdminGuard)
  listSessions(@Req() request: Request & { admin: AuthenticatedAdmin }) {
    return this.adminService.listSessions(request.admin);
  }

  @Delete("sessions/:sessionId")
  @UseGuards(AdminGuard)
  revokeSession(
    @Req() request: Request & { admin: AuthenticatedAdmin },
    @Param("sessionId", new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.adminService.revokeSession(request.admin, sessionId);
  }

  private presentResult(
    response: Response,
    platform: SessionPlatform,
    result: AdminAuthResult,
  ) {
    const {
      token,
      refreshToken,
      accessExpiresIn,
      refreshExpiresAt,
      sessionId,
      deviceUuid,
      admin,
    } = result;
    if (platform === SessionPlatform.WEB) {
      setSessionCookies(response, SessionPrincipalType.ADMIN, {
        accessToken: token,
        refreshToken,
        accessExpiresIn,
        refreshExpiresAt,
        sessionId,
        deviceUuid,
      });
      return {
        admin,
        expiresIn: accessExpiresIn,
      };
    }
    response.setHeader("Cache-Control", "no-store");
    return {
      token,
      refreshToken,
      expiresIn: accessExpiresIn,
      refreshExpiresAt,
      sessionId,
      admin,
    };
  }
}
