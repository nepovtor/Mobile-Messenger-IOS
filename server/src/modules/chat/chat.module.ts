import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChatEntity } from "../../entities/chat.entity";
import { ChatParticipantEntity } from "../../entities/chat-participant.entity";
import { MediaEntity } from "../../entities/media.entity";
import { MessageEntity } from "../../entities/message.entity";
import { UserEntity } from "../../entities/user.entity";
import { AuthModule } from "../auth/auth.module";
import { MediaModule } from "../media/media.module";
import { PushModule } from "../push/push.module";
import { ChatEventsModule } from "../chat-events/chat-events.module";
import { ChatController } from "./chat.controller";
import { ChatPresenter } from "./chat.presenter";
import { ChatService } from "./chat.service";
import { DemoChatSeeder } from "./demo-chat.seeder";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatEntity,
      ChatParticipantEntity,
      MessageEntity,
      UserEntity,
      MediaEntity,
    ]),
    AuthModule,
    ChatEventsModule,
    MediaModule,
    PushModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatPresenter, DemoChatSeeder],
  exports: [ChatService],
})
export class ChatModule {}
