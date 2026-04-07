import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      status: "ok",
      api: "/api",
      availableRoutes: [
        "/api/health",
        "/api/version",
        "/api/auth/request",
        "/api/auth/verify",
        "/api/chats",
        "/api/chats/:chatId/messages",
        "/api/chats/:chatId/messages [POST]",
        "/api/chats [POST]",
      ],
      message: "Welcome to Mobile Messenger API",
    };
  }
}
