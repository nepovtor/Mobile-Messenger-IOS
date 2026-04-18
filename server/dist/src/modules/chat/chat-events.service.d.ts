import { MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import type { Chat, Message } from "./chat.service";
export declare class ChatEventsService {
    private readonly subscribers;
    subscribe(chatID: string, userID: string, initialChat: Chat): Observable<MessageEvent>;
    publishMessage(chatID: string, message: Message): void;
    publishChatUpdated(chatID: string, resolveChatForUser: (userID: string) => Promise<Chat>): Promise<void>;
    private makeMessageEvent;
}
