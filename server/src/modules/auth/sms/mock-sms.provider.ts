import { SmsService } from "./sms.types";

export class MockSmsProvider implements SmsService {
  readonly sentMessages: Array<{ phone: string; code: string }> = [];

  async sendVerificationCode(phone: string, code: string): Promise<void> {
    this.sentMessages.push({ phone, code });
  }
}
