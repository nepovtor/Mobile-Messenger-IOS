import { Module } from "@nestjs/common";
import { ChatEventsService } from "./chat-events.service";

@Module({
  providers: [ChatEventsService],
  exports: [ChatEventsService],
})
export class ChatEventsModule {}
