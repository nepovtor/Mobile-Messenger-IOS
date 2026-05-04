"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramNotLinkedError = exports.SmsProviderUnavailableError = exports.SMS_SERVICE = void 0;
exports.SMS_SERVICE = Symbol("SMS_SERVICE");
class SmsProviderUnavailableError extends Error {
    constructor(message = "SMS provider unavailable") {
        super(message);
        this.name = "SmsProviderUnavailableError";
    }
}
exports.SmsProviderUnavailableError = SmsProviderUnavailableError;
class TelegramNotLinkedError extends Error {
    constructor(message = "Link Telegram in the app first and send your own contact to the bot before requesting a code.") {
        super(message);
        this.code = "TELEGRAM_NOT_LINKED";
        this.name = "TelegramNotLinkedError";
    }
}
exports.TelegramNotLinkedError = TelegramNotLinkedError;
//# sourceMappingURL=sms.types.js.map