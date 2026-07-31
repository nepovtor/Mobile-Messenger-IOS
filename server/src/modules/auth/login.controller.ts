import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import {
  SessionPlatform,
  SessionPrincipalType,
} from "../../entities/auth-session.entity";
import { setSessionCookies } from "../sessions/session-cookies";
import { buildSessionRequestContext } from "../sessions/session-request";
import { AuthService } from "./auth.service";
import { Public } from "./decorators/public.decorator";
import { LabLoginDto } from "./dto/lab-login.dto";

@Controller()
export class LoginController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @Public()
  async login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: LabLoginDto,
  ) {
    const context = buildSessionRequestContext(request);
    const result = await this.authService.loginLabUser(dto, context);
    if (context.platform === SessionPlatform.WEB) {
      setSessionCookies(response, SessionPrincipalType.USER, {
        accessToken: result.token,
        refreshToken: result.refreshToken,
        accessExpiresIn: result.accessExpiresIn,
        refreshExpiresAt: result.refreshExpiresAt,
        sessionId: result.sessionId,
        deviceUuid: result.deviceUuid,
      });
      return { authenticated: true };
    }
    return result;
  }
}
