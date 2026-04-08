import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedRequest } from "../../auth.types";
import { JwtAuthGuard } from "../../jwt-auth.guard";
import { AuthService } from "./auth.service";
import { RequestCodeDto } from "./dto/request-code.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
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

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Req() request: AuthenticatedRequest) {
    return this.authService.getCurrentUser(request.user.sub);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Body() body: UpdateProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.authService.updateProfile(request.user.sub, body);
  }
}
