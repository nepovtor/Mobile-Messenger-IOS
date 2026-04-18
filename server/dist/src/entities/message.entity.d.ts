import { Chat } from "./chat.entity";
import { User } from "./user.entity";
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";
export declare class Message {
    id: string;
    messageID: string;
    text: string;
    author: User;
    chat: Chat;
    createdAt: Date;
    status: MessageStatus;
}
