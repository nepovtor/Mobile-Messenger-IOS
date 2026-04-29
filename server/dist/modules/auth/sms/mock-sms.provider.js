"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockSmsProvider = void 0;
class MockSmsProvider {
    constructor() {
        this.sentMessages = [];
    }
    async sendVerificationCode(phone, code) {
        this.sentMessages.push({ phone, code });
    }
}
exports.MockSmsProvider = MockSmsProvider;
//# sourceMappingURL=mock-sms.provider.js.map