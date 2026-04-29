import { Logger } from "@nestjs/common";
import { getSmsFrom } from "../../common/runtime-config";
import { SmsProviderUnavailableError, SmsService } from "./sms.types";

type TwilioConfig = {
  accountSID: string;
  authToken: string;
  from: string;
};

export class TwilioSmsProvider implements SmsService {
  constructor(
    private readonly config: TwilioConfig,
    private readonly logger: Logger,
  ) {}

  async sendVerificationCode(phone: string, code: string): Promise<void> {
    const body = new URLSearchParams({
      To: phone,
      From: this.config.from || getSmsFrom(),
      Body: `Your Mobile Messenger verification code is: ${code}`,
    });

    const auth = Buffer.from(
      `${this.config.accountSID}:${this.config.authToken}`,
    ).toString("base64");

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    if (!response.ok) {
      const responseText = await response.text();
      this.logger.error(
        `Twilio SMS request failed for ${phone}: status=${response.status} body=${responseText.slice(0, 160)}`,
      );
      throw new SmsProviderUnavailableError("SMS provider unavailable");
    }
  }
}
