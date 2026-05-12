import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/decorators/public.decorator";

@Controller()
export class AppController {
  @Get()
  @Public()
  root() {
    return {
      status: "ok",
      api: "/api",
      availableRoutes: [
        "/api/health",
        "/api/version",
        "/api/auth/request",
        "/api/auth/verify",
        "/api/contacts",
        "/api/location/me",
        "/api/location/contacts",
        "/api/chats",
        "/api/chats/:chatId/messages",
        "/api/chats/:chatId/messages [POST]",
        "/api/chats [POST]",
        "/api/system/overview",
        "/api/system/logs/requests",
        "/api/system/logs/errors",
      ],
      message: "Welcome to Mobile Messenger API",
    };
  }
}
