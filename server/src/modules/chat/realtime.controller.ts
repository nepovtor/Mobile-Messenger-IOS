import { Controller, MessageEvent, Req, Sse, UseGuards } from "@nestjs/common";
import { Observable } from "rxjs";
import { AuthenticatedRequest } from "../../auth.types";
import { JwtAuthGuard } from "../../jwt-auth.guard";
import { ChatEventsService } from "./chat-events.service";

@Controller("realtime")
@UseGuards(JwtAuthGuard)
export class RealtimeController {
  constructor(private readonly chatEventsService: ChatEventsService) {}

  @Sse("events")
  streamAllEvents(
    @Req() request: AuthenticatedRequest,
  ): Observable<MessageEvent> {
    return this.chatEventsService.subscribeAll(request.user.sub);
  }
}
