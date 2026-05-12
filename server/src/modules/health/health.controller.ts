import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";

@Controller("health")
export class HealthController {
  @Get()
  @Public()
  check() {
    return {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
