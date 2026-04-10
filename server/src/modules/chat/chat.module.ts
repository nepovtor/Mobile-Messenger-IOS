import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChatEntity } from "../../entities/chat.entity";
import { ChatParticipantEntity } from "../../entities/chat-participant.entity";
import { MessageEntity } from "../../entities/message.entity";
import { UserEntity } from "../../entities/user.entity";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatEntity,
      ChatParticipantEntity,
      MessageEntity,
      UserEntity,
    ]),
    AuthModule,
    RealtimeModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
