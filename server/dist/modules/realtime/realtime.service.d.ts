import { MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
interface RealtimePayload {
    type: string;
    payload: string | object;
}
export declare class RealtimeService {
    private readonly userStreams;
    private readonly typingState;
    subscribe(userID: string): Observable<MessageEvent>;
    publishToUsers(userIDs: string[], message: RealtimePayload): void;
    setTyping(chatID: string, userID: string, displayName: string, isTyping: boolean): string[];
    getTypingParticipants(chatID: string, excludeUserID?: string): string[];
    private getStream;
}
export {};
