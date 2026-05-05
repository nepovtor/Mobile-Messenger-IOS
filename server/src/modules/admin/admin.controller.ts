import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthenticatedAdmin } from "../common/authenticated-admin";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";
import { AdminLoginDto } from "./dto/admin-login.dto";

@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post("login")
  login(@Body() dto: AdminLoginDto) {
    return this.adminService.login(dto);
  }

  @Get("me")
  @UseGuards(AdminGuard)
  getMe(@Req() request: Request & { admin: AuthenticatedAdmin }) {
    return this.adminService.getMe(request.admin);
  }
}
