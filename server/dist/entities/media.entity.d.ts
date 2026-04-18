import { MessageEntity } from "./message.entity";
import { UserEntity } from "./user.entity";
export declare enum MediaStatus {
    PENDING = "pending",
    UPLOADED = "uploaded"
}
export declare class MediaEntity {
    id: `${string}-${string}-${string}-${string}-${string}`;
    objectKey: string;
    mimeType: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    uploadedById: string;
    uploadedBy: UserEntity;
    status: MediaStatus;
    createdAt: Date;
    messages?: MessageEntity[];
}
