import { Controller, MessageEvent, Sse, UseGuards } from "@nestjs/common";
import { Observable } from "rxjs";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthenticatedUser } from "../common/authenticated-user";
import { RealtimeService } from "./realtime.service";

@Controller("realtime")
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Sse("events")
  @UseGuards(AuthGuard)
  events(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return this.realtimeService.subscribe(user.sub);
  }
}
