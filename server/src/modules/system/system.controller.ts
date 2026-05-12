import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import { SkipUserAuth } from "../auth/decorators/skip-user-auth.decorator";
import { AdminGuard } from "../admin/admin.guard";
import { SystemService } from "./system.service";

@Controller("system")
@SkipUserAuth()
@UseGuards(AdminGuard)
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get("overview")
  getOverview() {
    return this.systemService.getOverview();
  }

  @Get("logs/requests")
  getRequestLogs(
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.systemService.getRequestLogs(limit);
  }

  @Get("logs/errors")
  getErrorLogs(
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.systemService.getErrorLogs(limit);
  }
}
