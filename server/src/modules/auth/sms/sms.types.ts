export interface SmsService {
  sendVerificationCode(phone: string, code: string): Promise<void>;
}

export const SMS_SERVICE = Symbol("SMS_SERVICE");

export class SmsProviderUnavailableError extends Error {
  constructor(message = "SMS provider unavailable") {
    super(message);
    this.name = "SmsProviderUnavailableError";
  }
}

export class TelegramNotLinkedError extends Error {
  readonly code = "TELEGRAM_NOT_LINKED";

  constructor(
    message = "Link Telegram in the app first and send your own contact to the bot before requesting a code.",
  ) {
    super(message);
    this.name = "TelegramNotLinkedError";
  }
}
