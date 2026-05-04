import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Repository } from "typeorm";
import { TelegramLinkEntity } from "../../../entities/telegram-link.entity";
import { TelegramPairingTokenEntity } from "../../../entities/telegram-pairing-token.entity";
import { AuthRateLimitService } from "../auth-rate-limit.service";
import { SmsService } from "../sms/sms.types";
type TelegramUpdate = {
    update_id: number;
    message?: {
        message_id: number;
        text?: string;
        chat: {
            id: number | string;
            username?: string;
            first_name?: string;
        };
        from?: {
            id: number;
            username?: string;
            first_name?: string;
        };
        contact?: {
            phone_number?: string;
            first_name?: string;
            user_id?: number;
        };
    };
};
export declare class TelegramBotService implements OnModuleInit, OnModuleDestroy, SmsService {
    private readonly telegramLinksRepository;
    private readonly telegramPairingTokensRepository;
    private readonly authRateLimitService;
    private readonly logger;
    private readonly pairingTokenTTLSeconds;
    private readonly linkResendCooldownSeconds;
    private pollingTimer;
    private lastUpdateID;
    private polling;
    constructor(telegramLinksRepository: Repository<TelegramLinkEntity>, telegramPairingTokensRepository: Repository<TelegramPairingTokenEntity>, authRateLimitService: AuthRateLimitService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): void;
    startBot(): Promise<void>;
    createPairingLink(rawPhone: string, requestContext?: {
        requestIP?: string | null;
        userAgent?: string | null;
    }): Promise<{
        botUsername: string;
        telegramStartUrl: string;
        expiresIn: number;
    }>;
    sendVerificationCode(phone: string, code: string): Promise<void>;
    handleUpdate(update: TelegramUpdate): Promise<void>;
    private handleSecureStart;
    private handleContactMessage;
    private upsertTelegramLink;
    private buildMessageContext;
    private extractStartToken;
    private findActiveLinkByPhone;
    private findPendingPairing;
    private findPairingToken;
    private invalidateActivePairingTokens;
    private normalizeTelegramPhoneInput;
    private generatePairingToken;
    private hashPairingToken;
    private sendGenericStartMessage;
    private sendOpenFromAppMessage;
    private sendContactRequiredMessage;
    private sendTelegramIdentityRequiredMessage;
    private sendRelinkBlockedMessage;
    private pollOnce;
    private callTelegram;
}
export {};
