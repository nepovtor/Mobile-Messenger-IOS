import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { normalizePhone } from "../common/contact.utils";
import { CurrentUser } from "./decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/authenticated-user";
import { AuthGuard } from "./auth.guard";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { Public } from "./decorators/public.decorator";
import { AuthService } from "./auth.service";
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
    this.authRateLimitService.consume(`${this.getRequestIP(request)}:request`, {
      message: "Too many auth requests",
    });
    return this.authService.requestCode(dto, {
      requestIP: this.getRequestIP(request),
      userAgent: this.getUserAgent(request),
    });
  }

  @Post("verify")
  @Public()
  verifyCode(@Req() request: Request, @Body() dto: VerifyAuthDto) {
    const phoneOrContact = dto.phone ?? dto.contact;
    if (phoneOrContact) {
      try {
        const normalizedPhone = normalizePhone(phoneOrContact);
        this.authRateLimitService.consume(
          `${this.getRequestIP(request)}:verify:${normalizedPhone}`,
          {
            maxRequests: 10,
            message: "Too many auth attempts",
          },
        );
      } catch {
        this.authRateLimitService.consume(
          `${this.getRequestIP(request)}:verify`,
        );
      }
    }
    return this.authService.verifyCode(dto);
  }

  @Post("login")
  @Public()
  login(@Req() request: Request, @Body() dto: LoginAuthDto) {
    this.authRateLimitService.consume(`${this.getRequestIP(request)}:login`);
    return this.authService.login(dto);
  }

  @Post("telegram/pairing")
  @Public()
  createTelegramPairing(
    @Req() request: Request,
    @Body() dto: RequestTelegramPairingDto,
  ) {
    return this.telegramBotService.createPairingLink(dto.phone, {
      requestIP: this.getRequestIP(request),
      userAgent: this.getUserAgent(request),
    });
  }

  @Get("me")
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.sub);
  }

  private getRequestIP(request: Request): string {
    const forwardedFor = request.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string") {
      const firstForwardedFor = forwardedFor.split(",")[0];
      return firstForwardedFor ? firstForwardedFor.trim() : "unknown";
    }

    return request.ip || "unknown";
  }

  private getUserAgent(request: Request): string | null {
    const userAgent = request.headers["user-agent"];
    return typeof userAgent === "string" ? userAgent : null;
  }
}
