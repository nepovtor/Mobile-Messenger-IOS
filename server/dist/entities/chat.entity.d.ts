import { ChatParticipantEntity } from "./chat-participant.entity";
import { MessageEntity } from "./message.entity";
export declare class ChatEntity {
    id: `${string}-${string}-${string}-${string}-${string}`;
    title: string;
    lastMessagePreview: string | null;
    lastActivity: Date;
    createdAt: Date;
    participants?: ChatParticipantEntity[];
    messages?: MessageEntity[];
}
