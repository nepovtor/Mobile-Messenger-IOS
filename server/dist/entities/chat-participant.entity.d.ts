import { ChatEntity } from "./chat.entity";
import { UserEntity } from "./user.entity";
export declare class ChatParticipantEntity {
    id: `${string}-${string}-${string}-${string}-${string}`;
    chatId: string;
    chat: ChatEntity;
    userId: string;
    user: UserEntity;
    lastReadMessageId: string | null;
    lastReadAt: Date | null;
    joinedAt: Date;
}
