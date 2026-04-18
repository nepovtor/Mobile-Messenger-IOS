import { Chat } from "./chat.entity";
import { User } from "./user.entity";
export declare class ChatReadState {
    id: string;
    chat: Chat;
    user: User;
    lastReadAt: Date | null;
    lastReadMessageID: string | null;
    updatedAt: Date;
}
