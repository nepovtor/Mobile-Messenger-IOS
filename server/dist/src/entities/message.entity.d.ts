import { Chat } from "./chat.entity";
import { User } from "./user.entity";
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";
export type MessageKind = "text" | "image";
export declare class Message {
    id: string;
    messageID: string;
    kind: MessageKind;
    text: string;
    mediaID: string | null;
    mediaURL: string | null;
    author: User;
    chat: Chat;
    createdAt: Date;
    status: MessageStatus;
}
