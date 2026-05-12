import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthenticatedAdmin } from "../common/authenticated-admin";
import { Public } from "../auth/decorators/public.decorator";
import { SkipUserAuth } from "../auth/decorators/skip-user-auth.decorator";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";
import { AdminLoginDto } from "./dto/admin-login.dto";

@Controller("admin")
@SkipUserAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post("login")
  @Public()
  login(@Body() dto: AdminLoginDto) {
    return this.adminService.login(dto);
  }

  @Get("me")
  @UseGuards(AdminGuard)
  getMe(@Req() request: Request & { admin: AuthenticatedAdmin }) {
    return this.adminService.getMe(request.admin);
  }
}
