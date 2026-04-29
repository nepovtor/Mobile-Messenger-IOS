import { Logger } from "@nestjs/common";
import { SmsProviderUnavailableError, SmsService } from "./sms.types";

export class UnavailableSmsProvider implements SmsService {
  constructor(
    private readonly logger: Logger,
    private readonly reason: string,
  ) {}

  async sendVerificationCode(phone: string): Promise<void> {
    this.logger.error(`SMS provider unavailable for ${phone}: ${this.reason}`);
    throw new SmsProviderUnavailableError("SMS provider unavailable");
  }
}
