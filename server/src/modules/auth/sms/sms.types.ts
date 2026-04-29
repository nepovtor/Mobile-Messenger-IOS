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
