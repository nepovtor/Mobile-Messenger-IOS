import { Module } from "@nestjs/common";
import { ChatEventsModule } from "../chat-events/chat-events.module";
import { ChatModule } from "../chat/chat.module";
import { AuthModule } from "../auth/auth.module";
import { RealtimeController } from "./realtime.controller";
import { RealtimeGateway } from "./realtime.gateway";
import { RealtimeService } from "./realtime.service";

@Module({
  imports: [AuthModule, ChatEventsModule, ChatModule],
  controllers: [RealtimeController],
  providers: [RealtimeService, RealtimeGateway],
  exports: [RealtimeService],
})
export class RealtimeModule {}
