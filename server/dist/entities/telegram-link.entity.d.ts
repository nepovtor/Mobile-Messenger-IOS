export declare class TelegramLinkEntity {
    id: `${string}-${string}-${string}-${string}-${string}`;
    phone: string;
    chatId: string;
    telegramUserId: string | null;
    username: string | null;
    firstName: string | null;
    linkedAt: Date;
    lastVerifiedAt: Date | null;
    revokedAt: Date | null;
    updatedAt: Date;
}
