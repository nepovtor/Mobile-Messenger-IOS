import { ChatParticipantEntity } from "./chat-participant.entity";
import { MediaEntity } from "./media.entity";
import { MessageEntity } from "./message.entity";
export declare enum AuthMethod {
    PHONE = "phone",
    EMAIL = "email"
}
export declare class UserEntity {
    id: `${string}-${string}-${string}-${string}-${string}`;
    method: AuthMethod;
    contact: string;
    displayName: string;
    createdAt: Date;
    chatParticipants?: ChatParticipantEntity[];
    messages?: MessageEntity[];
    uploadedMedia?: MediaEntity[];
}
