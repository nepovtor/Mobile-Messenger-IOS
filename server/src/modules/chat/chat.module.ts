import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Chat } from "../../entities/chat.entity";
import { ChatReadState } from "../../entities/chat-read-state.entity";
import { Message } from "../../entities/message.entity";
import { User } from "../../entities/user.entity";
import { ChatController } from "./chat.controller";
import { ChatEventsService } from "./chat-events.service";
import { ChatGateway } from "./chat.gateway";
import { ChatService } from "./chat.service";

function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }

  return "development-only-secret";
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Chat, Message, User, ChatReadState]),
    JwtModule.register({
      secret: resolveJwtSecret(),
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, ChatEventsService],
  exports: [ChatService, ChatEventsService],
})
export class ChatModule {}
