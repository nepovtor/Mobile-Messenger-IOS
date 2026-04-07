import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RequestCodeDto } from "./dto/request-code.dto";
import { VerifyCodeDto } from "./dto/verify-code.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("request")
  async requestCode(@Body() body: RequestCodeDto) {
    return this.authService.requestCode(body);
  }

  @Post("verify")
  async verifyCode(@Body() body: VerifyCodeDto) {
    return this.authService.verifyCode(body);
  }
}
