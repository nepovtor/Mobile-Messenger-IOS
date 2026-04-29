"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleSmsProvider = void 0;
const runtime_config_1 = require("../../common/runtime-config");
const sms_types_1 = require("./sms.types");
class ConsoleSmsProvider {
    constructor(logger) {
        this.logger = logger;
    }
    async sendVerificationCode(phone, code) {
        if (!(0, runtime_config_1.canUseConsoleSmsInCurrentEnv)()) {
            this.logger.error(`Console SMS provider is disabled in production for ${phone}`);
            throw new sms_types_1.SmsProviderUnavailableError("SMS provider unavailable");
        }
        if ((0, runtime_config_1.isProductionEnv)()) {
            this.logger.warn(`Console SMS provider used for ${phone}`);
            return;
        }
        this.logger.log(`[sms:console] ${phone} verification code: ${code}`);
    }
}
exports.ConsoleSmsProvider = ConsoleSmsProvider;
//# sourceMappingURL=console-sms.provider.js.map