import { ChatEntity } from "./chat.entity";
import { UserEntity } from "./user.entity";
export declare class ChatReadState {
    id: string;
    chat: ChatEntity;
    user: UserEntity;
    lastReadAt: Date | null;
    lastReadMessageID: string | null;
    updatedAt: Date;
}
