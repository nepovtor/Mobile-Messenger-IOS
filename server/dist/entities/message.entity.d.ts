import { ChatEntity } from "./chat.entity";
import { MediaEntity } from "./media.entity";
import { UserEntity } from "./user.entity";
export declare enum MessageStatus {
    SENDING = "sending",
    SENT = "sent",
    DELIVERED = "delivered",
    READ = "read",
    FAILED = "failed"
}
export declare enum MessageKind {
    TEXT = "text",
    IMAGE = "image"
}
export declare class MessageEntity {
    id: `${string}-${string}-${string}-${string}-${string}`;
    chatId: string;
    chat: ChatEntity;
    authorId: string;
    author: UserEntity;
    clientMessageId: string;
    kind: MessageKind;
    text: string | null;
    mediaId: string | null;
    media: MediaEntity | null;
    status: MessageStatus;
    createdAt: Date;
}
