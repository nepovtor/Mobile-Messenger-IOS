"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhone = normalizePhone;
exports.normalizeContact = normalizeContact;
exports.buildDisplayName = buildDisplayName;
const common_1 = require("@nestjs/common");
const user_entity_1 = require("../../entities/user.entity");
const E164_LIKE_PHONE = /^\+[1-9]\d{7,14}$/;
function normalizePhone(phone) {
    const trimmed = phone.trim();
    if (!trimmed) {
        throw new common_1.BadRequestException("Phone number is required");
    }
    if (!trimmed.startsWith("+")) {
        throw new common_1.BadRequestException("Phone number must be in international format and start with +");
    }
    if (/[A-Za-z]/.test(trimmed)) {
        throw new common_1.BadRequestException("Phone number contains invalid characters");
    }
    const normalized = trimmed.replace(/[\s()-]/g, "");
    if (!/^\+\d+$/.test(normalized)) {
        throw new common_1.BadRequestException("Phone number contains invalid characters");
    }
    if (!E164_LIKE_PHONE.test(normalized)) {
        throw new common_1.BadRequestException("Phone number must contain between 8 and 15 digits in international format");
    }
    return normalized;
}
function normalizeContact(method, contact) {
    const trimmed = contact.trim();
    if (!trimmed) {
        throw new common_1.BadRequestException("Contact is required");
    }
    if (method === user_entity_1.AuthMethod.PHONE) {
        return normalizePhone(trimmed);
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