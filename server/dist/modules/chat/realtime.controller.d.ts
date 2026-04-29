import { MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import { AuthenticatedRequest } from "../../auth.types";
import { ChatEventsService } from "./chat-events.service";
export declare class RealtimeController {
    private readonly chatEventsService;
    constructor(chatEventsService: ChatEventsService);
    streamAllEvents(request: AuthenticatedRequest): Observable<MessageEvent>;
}
