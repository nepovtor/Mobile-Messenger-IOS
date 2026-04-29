import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Repository } from "typeorm";
import { TelegramLinkEntity } from "../../../entities/telegram-link.entity";
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
    private readonly logger;
    private pollingTimer;
    private lastUpdateID;
    private polling;
    constructor(telegramLinksRepository: Repository<TelegramLinkEntity>);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): void;
    startBot(): Promise<void>;
    sendVerificationCode(phone: string, code: string): Promise<void>;
    handleUpdate(update: TelegramUpdate): Promise<void>;
    private pollOnce;
    private callTelegram;
}
export {};
