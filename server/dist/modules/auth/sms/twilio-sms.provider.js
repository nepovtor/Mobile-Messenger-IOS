"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwilioSmsProvider = void 0;
const runtime_config_1 = require("../../common/runtime-config");
const sms_types_1 = require("./sms.types");
class TwilioSmsProvider {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
    }
    async sendVerificationCode(phone, code) {
        const body = new URLSearchParams({
            To: phone,
            From: this.config.from || (0, runtime_config_1.getSmsFrom)(),
            Body: `Your Mobile Messenger verification code is: ${code}`,
        });
        const auth = Buffer.from(`${this.config.accountSID}:${this.config.authToken}`).toString("base64");
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSID}/Messages.json`, {
            method: "POST",
            headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
        });
        if (!response.ok) {
            const responseText = await response.text();
            this.logger.error(`Twilio SMS request failed for ${phone}: status=${response.status} body=${responseText.slice(0, 160)}`);
            throw new sms_types_1.SmsProviderUnavailableError("SMS provider unavailable");
        }
    }
}
exports.TwilioSmsProvider = TwilioSmsProvider;
//# sourceMappingURL=twilio-sms.provider.js.map