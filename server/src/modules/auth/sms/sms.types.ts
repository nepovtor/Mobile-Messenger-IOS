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
    message = "Open the Telegram bot and send your phone number before requesting a code.",
  ) {
    super(message);
    this.name = "TelegramNotLinkedError";
  }
}
