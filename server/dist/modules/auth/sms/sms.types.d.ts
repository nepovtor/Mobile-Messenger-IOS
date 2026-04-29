export interface SmsService {
    sendVerificationCode(phone: string, code: string): Promise<void>;
}
export declare const SMS_SERVICE: unique symbol;
export declare class SmsProviderUnavailableError extends Error {
    constructor(message?: string);
}
export declare class TelegramNotLinkedError extends Error {
    readonly code = "TELEGRAM_NOT_LINKED";
    constructor(message?: string);
}
