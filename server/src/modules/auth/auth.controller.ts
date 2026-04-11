import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "./decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/authenticated-user";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { LoginAuthDto } from "./dto/login-auth.dto";
import { RequestAuthDto } from "./dto/request-auth.dto";
import { VerifyAuthDto } from "./dto/verify-auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("request")
  requestCode(@Body() dto: RequestAuthDto) {
    return this.authService.requestCode(dto);
  }

  @Post("verify")
  verifyCode(@Body() dto: VerifyAuthDto) {
    return this.authService.verifyCode(dto);
  }

  @Post("login")
  login(@Body() dto: LoginAuthDto) {
    return this.authService.login(dto);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.sub);
  }
}
