import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { CurrentUser } from "./decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/authenticated-user";
import { AuthGuard } from "./auth.guard";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthService } from "./auth.service";
import { LoginAuthDto } from "./dto/login-auth.dto";
import { RequestAuthDto } from "./dto/request-auth.dto";
import { VerifyAuthDto } from "./dto/verify-auth.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authRateLimitService: AuthRateLimitService,
  ) {}

  @Post("request")
  requestCode(@Req() request: Request, @Body() dto: RequestAuthDto) {
    this.authRateLimitService.consume(
      `${this.getRequestIP(request)}:request:${dto.method}`,
    );
    return this.authService.requestCode(dto);
  }

  @Post("verify")
  verifyCode(@Req() request: Request, @Body() dto: VerifyAuthDto) {
    this.authRateLimitService.consume(
      `${this.getRequestIP(request)}:verify:${dto.method}`,
    );
    return this.authService.verifyCode(dto);
  }

  @Post("login")
  login(@Req() request: Request, @Body() dto: LoginAuthDto) {
    this.authRateLimitService.consume(
      `${this.getRequestIP(request)}:login:${dto.method}`,
    );
    return this.authService.login(dto);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.sub);
  }

  @Get("contacts")
  @UseGuards(AuthGuard)
  listContacts(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listContacts(user.sub);
  }

  private getRequestIP(request: Request): string {
    const forwardedFor = request.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string") {
      return forwardedFor.split(",")[0].trim();
    }

    return request.ip || "unknown";
  }
}
