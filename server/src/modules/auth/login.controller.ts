import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { Public } from "./decorators/public.decorator";
import { LabLoginDto } from "./dto/lab-login.dto";

@Controller()
export class LoginController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @Public()
  login(@Body() dto: LabLoginDto) {
    return this.authService.loginLabUser(dto);
  }
}
