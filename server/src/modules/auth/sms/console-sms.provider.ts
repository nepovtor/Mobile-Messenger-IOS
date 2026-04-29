import { Logger } from "@nestjs/common";
import {
  canUseConsoleSmsInCurrentEnv,
  isProductionEnv,
} from "../../common/runtime-config";
import { SmsProviderUnavailableError, SmsService } from "./sms.types";

export class ConsoleSmsProvider implements SmsService {
  constructor(private readonly logger: Logger) {}

  async sendVerificationCode(phone: string, code: string): Promise<void> {
    if (!canUseConsoleSmsInCurrentEnv()) {
      this.logger.error(
        `Console SMS provider is disabled in production for ${phone}`,
      );
      throw new SmsProviderUnavailableError("SMS provider unavailable");
    }

    if (isProductionEnv()) {
      this.logger.warn(`Console SMS provider used for ${phone}`);
      return;
    }

    this.logger.log(`[sms:console] ${phone} verification code: ${code}`);
  }
}
