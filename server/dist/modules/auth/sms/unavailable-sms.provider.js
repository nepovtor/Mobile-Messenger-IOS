"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnavailableSmsProvider = void 0;
const sms_types_1 = require("./sms.types");
class UnavailableSmsProvider {
    constructor(logger, reason) {
        this.logger = logger;
        this.reason = reason;
    }
    async sendVerificationCode(phone) {
        this.logger.error(`SMS provider unavailable for ${phone}: ${this.reason}`);
        throw new sms_types_1.SmsProviderUnavailableError("SMS provider unavailable");
    }
}
exports.UnavailableSmsProvider = UnavailableSmsProvider;
//# sourceMappingURL=unavailable-sms.provider.js.map