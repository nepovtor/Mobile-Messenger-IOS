import { Logger } from "@nestjs/common";
import {
  canUseConsoleSmsInCurrentEnv,
  isProductionEnv,
} from "../../common/runtime-config";
import { SmsProviderUnavailableError, SmsService } from "./sms.types";

export class ConsoleSmsProvider implements SmsService {
  constructor(private readonly logger: Logger) {}

  async sendVerificationCode(): Promise<void> {
    if (!canUseConsoleSmsInCurrentEnv()) {
      this.logger.error("Console SMS provider is disabled in production");
      throw new SmsProviderUnavailableError("SMS provider unavailable");
    }

    if (isProductionEnv()) {
      this.logger.warn("Console SMS provider was invoked");
      return;
    }

    this.logger.log("[sms:console] Verification challenge generated");
  }
}
