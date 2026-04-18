import { User } from "./user.entity";
export declare class Chat {
    id: string;
    title: string;
    lastMessagePreview: string;
    lastActivity: Date | null;
    participants: User[];
    createdAt: Date;
    updatedAt: Date;
}
