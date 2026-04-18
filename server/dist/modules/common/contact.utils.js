"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeContact = normalizeContact;
exports.buildDisplayName = buildDisplayName;
const common_1 = require("@nestjs/common");
const user_entity_1 = require("../../entities/user.entity");
function normalizeContact(method, contact) {
    const trimmed = contact.trim();
    if (!trimmed) {
        throw new common_1.BadRequestException("Contact is required");
    }
    if (method === user_entity_1.AuthMethod.PHONE) {
        const normalized = trimmed.replace(/[^+\d]/g, "");
        if (normalized.replace(/\D/g, "").length < 10) {
            throw new common_1.BadRequestException("Phone number must contain at least 10 digits");
        }
        return normalized;
    }
    const normalized = trimmed.toLowerCase();
    if (!normalized.includes("@")) {
        throw new common_1.BadRequestException("Email is invalid");
    }
    return normalized;
}
function buildDisplayName(method, contact) {
    if (method === user_entity_1.AuthMethod.EMAIL) {
        return contact.split("@")[0] || "User";
    }
    const digits = contact.replace(/\D/g, "");
    const suffix = digits.slice(-4) || "User";
    return `User ${suffix}`;
}
//# sourceMappingURL=contact.utils.js.map