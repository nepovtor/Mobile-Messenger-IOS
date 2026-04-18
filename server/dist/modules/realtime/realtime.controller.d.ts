import { MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import { AuthenticatedUser } from "../common/authenticated-user";
import { RealtimeService } from "./realtime.service";
export declare class RealtimeController {
    private readonly realtimeService;
    constructor(realtimeService: RealtimeService);
    events(user: AuthenticatedUser): Observable<MessageEvent>;
}
