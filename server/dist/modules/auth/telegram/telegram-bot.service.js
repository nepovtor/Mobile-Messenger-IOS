"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TelegramBotService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramBotService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const node_crypto_1 = require("node:crypto");
const typeorm_2 = require("typeorm");
const telegram_link_entity_1 = require("../../../entities/telegram-link.entity");
const telegram_pairing_token_entity_1 = require("../../../entities/telegram-pairing-token.entity");
const contact_utils_1 = require("../../common/contact.utils");
const runtime_config_1 = require("../../common/runtime-config");
const auth_rate_limit_service_1 = require("../auth-rate-limit.service");
const sms_types_1 = require("../sms/sms.types");
let TelegramBotService = TelegramBotService_1 = class TelegramBotService {
    constructor(telegramLinksRepository, telegramPairingTokensRepository, authRateLimitService) {
        this.telegramLinksRepository = telegramLinksRepository;
        this.telegramPairingTokensRepository = telegramPairingTokensRepository;
        this.authRateLimitService = authRateLimitService;
        this.logger = new common_1.Logger(TelegramBotService_1.name);
        this.pairingTokenTTLSeconds = (0, runtime_config_1.getTelegramPairingTokenTTLSeconds)();
        this.linkResendCooldownSeconds = (0, runtime_config_1.getTelegramLinkResendCooldownSeconds)();
        this.pollingTimer = null;
        this.lastUpdateID = 0;
        this.polling = false;
    }
    async onModuleInit() {
        if (process.env.NODE_ENV === "test") {
            return;
        }
        await this.startBot();
    }
    onModuleDestroy() {
        if (this.pollingTimer) {
            clearTimeout(this.pollingTimer);
            this.pollingTimer = null;
        }
    }
    async startBot() {
        if ((0, runtime_config_1.getVerificationProvider)() !== "telegram") {
            return;
        }
        if (!(0, runtime_config_1.hasTelegramBotConfig)()) {
            const message = "Telegram verification provider is configured, but TELEGRAM_BOT_TOKEN is missing";
            if ((0, runtime_config_1.isProductionEnv)()) {
                this.logger.error(message);
            }
            else {
                this.logger.warn(message);
            }
            return;
        }
        if (this.polling) {
            return;
        }
        this.polling = true;
        await this.pollOnce();
    }
    async createPairingLink(rawPhone, requestContext) {
        const botUsername = (0, runtime_config_1.getTelegramBotUsername)();
        if (!(0, runtime_config_1.hasTelegramBotConfig)() || !botUsername) {
            throw new common_1.ServiceUnavailableException("Telegram pairing unavailable");
        }
        const phone = this.normalizeTelegramPhoneInput(rawPhone);
        const rateLimitWindowMs = this.linkResendCooldownSeconds * 1000;
        const requestIP = requestContext?.requestIP ?? "unknown";
        this.authRateLimitService.consume(`telegram-pairing:ip:${requestIP}`, {
            maxRequests: 5,
            windowMs: rateLimitWindowMs,
            message: "Too many Telegram pairing requests from this IP",
        });
        this.authRateLimitService.consume(`telegram-pairing:phone:${phone}`, {
            maxRequests: 1,
            windowMs: rateLimitWindowMs,
            message: `Telegram linking is cooling down. Try again in ${this.linkResendCooldownSeconds} seconds.`,
        });
        await this.invalidateActivePairingTokens(phone);
        const plainToken = this.generatePairingToken();
        const now = Date.now();
        await this.telegramPairingTokensRepository.save(this.telegramPairingTokensRepository.create({
            tokenHash: this.hashPairingToken(plainToken),
            phone,
            expiresAt: new Date(now + this.pairingTokenTTLSeconds * 1000),
            consumedAt: null,
            chatId: null,
            telegramUserId: null,
            attempts: 0,
        }));
        return {
            botUsername,
            telegramStartUrl: `https://t.me/${botUsername}?start=${encodeURIComponent(plainToken)}`,
            expiresIn: this.pairingTokenTTLSeconds,
        };
    }
    async sendVerificationCode(phone, code) {
        const token = (0, runtime_config_1.getTelegramBotToken)();
        if (!token) {
            throw new sms_types_1.SmsProviderUnavailableError("Telegram bot is not configured");
        }
        const link = await this.findActiveLinkByPhone(phone);
        if (!link?.chatId) {
            throw new sms_types_1.TelegramNotLinkedError();
        }
        if (!link.telegramUserId) {
            this.logger.warn(`Telegram link for ${phone} does not have telegramUserId yet; allowing delivery for backward compatibility`);
        }
        link.lastVerifiedAt = new Date();
        await this.telegramLinksRepository.save(link);
        await this.callTelegram("sendMessage", {
            chat_id: link.chatId,
            text: `Ваш код входа в Mobile Messenger: ${code}. Код действует ${Math.ceil((0, runtime_config_1.getAuthCodeTTLSeconds)() / 60)} минут.`,
        });
    }
    async handleUpdate(update) {
        if (!update.message) {
            return;
        }
        const { message } = update;
        const context = this.buildMessageContext(message);
        const startToken = this.extractStartToken(message.text);
        if (startToken !== null) {
            if (!startToken) {
                await this.sendGenericStartMessage(context.chatId);
                return;
            }
            await this.handleSecureStart(startToken, context);
            return;
        }
        const pendingPairing = context.telegramUserId === null
            ? null
            : await this.findPendingPairing(context.chatId, context.telegramUserId);
        if (message.contact) {
            await this.handleContactMessage(message, context, pendingPairing);
            return;
        }
        const text = message.text?.trim();
        if (!text) {
            return;
        }
        if (pendingPairing) {
            await this.sendContactRequiredMessage(context.chatId);
            return;
        }
        if (!(0, runtime_config_1.isTelegramTextPhoneLinkingAllowed)()) {
            await this.sendOpenFromAppMessage(context.chatId);
            return;
        }
        if (!context.telegramUserId) {
            await this.sendTelegramIdentityRequiredMessage(context.chatId);
            return;
        }
        try {
            const phone = this.normalizeTelegramPhoneInput(text);
            const result = await this.upsertTelegramLink({
                phone,
                chatId: context.chatId,
                telegramUserId: context.telegramUserId,
                username: context.username,
                firstName: context.firstName,
                markVerifiedAt: null,
            });
            if (result === "relink_blocked") {
                await this.sendRelinkBlockedMessage(context.chatId);
                return;
            }
            await this.callTelegram("sendMessage", {
                chat_id: context.chatId,
                text: "Номер привязан в режиме разработки. Для production используйте кнопку привязки из приложения и отправку собственного контакта.",
            });
        }
        catch {
            await this.callTelegram("sendMessage", {
                chat_id: context.chatId,
                text: "Введите номер в международном формате, например +375291234567.",
            });
        }
    }
    async handleSecureStart(plainToken, context) {
        if (!context.telegramUserId) {
            await this.sendTelegramIdentityRequiredMessage(context.chatId);
            return;
        }
        const pairingToken = await this.findPairingToken(plainToken);
        if (!pairingToken) {
            await this.callTelegram("sendMessage", {
                chat_id: context.chatId,
                text: "Эта ссылка привязки не найдена. Вернитесь в приложение и создайте новую.",
            });
            return;
        }
        if (pairingToken.consumedAt) {
            await this.callTelegram("sendMessage", {
                chat_id: context.chatId,
                text: "Эта ссылка уже использована. Вернитесь в приложение и запросите новую привязку.",
            });
            return;
        }
        if (pairingToken.expiresAt.getTime() <= Date.now()) {
            await this.callTelegram("sendMessage", {
                chat_id: context.chatId,
                text: "Срок действия ссылки истёк. Вернитесь в приложение и создайте новую привязку.",
            });
            return;
        }
        if ((pairingToken.chatId && pairingToken.chatId !== context.chatId) ||
            (pairingToken.telegramUserId &&
                pairingToken.telegramUserId !== context.telegramUserId)) {
            pairingToken.attempts += 1;
            await this.telegramPairingTokensRepository.save(pairingToken);
            await this.callTelegram("sendMessage", {
                chat_id: context.chatId,
                text: "Эта ссылка уже открыта в другом Telegram-аккаунте. Вернитесь в приложение и создайте новую привязку.",
            });
            return;
        }
        pairingToken.chatId = context.chatId;
        pairingToken.telegramUserId = context.telegramUserId;
        await this.telegramPairingTokensRepository.save(pairingToken);
        await this.callTelegram("sendMessage", {
            chat_id: context.chatId,
            text: `Привязка начата для номера ${pairingToken.phone}. Теперь отправьте свой номер кнопкой Telegram.`,
            reply_markup: JSON.stringify({
                keyboard: [
                    [
                        {
                            text: "Отправить свой номер телефона",
                            request_contact: true,
                        },
                    ],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
            }),
        });
    }
    async handleContactMessage(message, context, pendingPairing) {
        if (!context.telegramUserId) {
            await this.sendTelegramIdentityRequiredMessage(context.chatId);
            return;
        }
        if ((0, runtime_config_1.isTelegramOwnContactRequired)()) {
            if (typeof message.contact?.user_id !== "number") {
                await this.callTelegram("sendMessage", {
                    chat_id: context.chatId,
                    text: "Telegram не подтвердил владельца контакта. Нажмите кнопку отправки своего номера ещё раз.",
                });
                return;
            }
            if (message.contact.user_id !== Number(context.telegramUserId)) {
                await this.callTelegram("sendMessage", {
                    chat_id: context.chatId,
                    text: "Нужен именно ваш собственный контакт. Контакт другого пользователя не подходит.",
                });
                return;
            }
        }
        try {
            const phone = this.normalizeTelegramPhoneInput(message.contact?.phone_number ?? "");
            if (pendingPairing) {
                if (phone !== pendingPairing.phone) {
                    pendingPairing.attempts += 1;
                    await this.telegramPairingTokensRepository.save(pendingPairing);
                    await this.callTelegram("sendMessage", {
                        chat_id: context.chatId,
                        text: "Этот контакт не совпадает с номером, который вы указали в приложении. Вернитесь в приложение и создайте новую привязку, если номер изменился.",
                    });
                    return;
                }
                const result = await this.upsertTelegramLink({
                    phone,
                    chatId: context.chatId,
                    telegramUserId: context.telegramUserId,
                    username: context.username,
                    firstName: context.firstName,
                    markVerifiedAt: new Date(),
                });
                if (result === "relink_blocked") {
                    await this.sendRelinkBlockedMessage(context.chatId);
                    return;
                }
                pendingPairing.consumedAt = new Date();
                await this.telegramPairingTokensRepository.save(pendingPairing);
                await this.callTelegram("sendMessage", {
                    chat_id: context.chatId,
                    text: "Номер безопасно привязан. Вернитесь в приложение и запросите код.",
                });
                return;
            }
            if ((0, runtime_config_1.isProductionEnv)()) {
                await this.sendOpenFromAppMessage(context.chatId);
                return;
            }
            const result = await this.upsertTelegramLink({
                phone,
                chatId: context.chatId,
                telegramUserId: context.telegramUserId,
                username: context.username,
                firstName: context.firstName,
                markVerifiedAt: new Date(),
            });
            if (result === "relink_blocked") {
                await this.sendRelinkBlockedMessage(context.chatId);
                return;
            }
            await this.callTelegram("sendMessage", {
                chat_id: context.chatId,
                text: "Номер привязан. Для production безопаснее запускать бота через кнопку в приложении.",
            });
        }
        catch {
            await this.callTelegram("sendMessage", {
                chat_id: context.chatId,
                text: "Введите номер в международном формате, например +375291234567.",
            });
        }
    }
    async upsertTelegramLink(input) {
        const existingLink = await this.telegramLinksRepository.findOne({
            where: { phone: input.phone },
        });
        if (!existingLink) {
            await this.telegramLinksRepository.save(this.telegramLinksRepository.create({
                phone: input.phone,
                chatId: input.chatId,
                telegramUserId: input.telegramUserId,
                username: input.username,
                firstName: input.firstName,
                lastVerifiedAt: input.markVerifiedAt,
                revokedAt: null,
            }));
            return "linked";
        }
        const sameBinding = existingLink.chatId === input.chatId &&
            (existingLink.telegramUserId === input.telegramUserId ||
                existingLink.telegramUserId === null);
        const relinkAttempt = !sameBinding && !existingLink.revokedAt;
        if (relinkAttempt && !(0, runtime_config_1.isTelegramRelinkAllowed)()) {
            return "relink_blocked";
        }
        existingLink.chatId = input.chatId;
        existingLink.telegramUserId = input.telegramUserId;
        existingLink.username = input.username;
        existingLink.firstName = input.firstName;
        existingLink.revokedAt = null;
        if (input.markVerifiedAt) {
            existingLink.lastVerifiedAt = input.markVerifiedAt;
        }
        await this.telegramLinksRepository.save(existingLink);
        return "linked";
    }
    buildMessageContext(message) {
        return {
            chatId: String(message.chat.id),
            telegramUserId: typeof message.from?.id === "number" ? String(message.from.id) : null,
            username: message.from?.username ?? message.chat.username ?? null,
            firstName: message.contact?.first_name ??
                message.from?.first_name ??
                message.chat.first_name ??
                null,
        };
    }
    extractStartToken(text) {
        const trimmed = text?.trim();
        if (!trimmed) {
            return null;
        }
        const match = trimmed.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/);
        if (!match) {
            return null;
        }
        return match[1]?.trim() ?? "";
    }
    async findActiveLinkByPhone(phone) {
        return this.telegramLinksRepository.findOne({
            where: {
                phone,
                revokedAt: (0, typeorm_2.IsNull)(),
            },
        });
    }
    async findPendingPairing(chatId, telegramUserId) {
        return this.telegramPairingTokensRepository.findOne({
            where: {
                chatId,
                telegramUserId,
                consumedAt: (0, typeorm_2.IsNull)(),
                expiresAt: (0, typeorm_2.MoreThan)(new Date()),
            },
            order: { createdAt: "DESC" },
        });
    }
    async findPairingToken(plainToken) {
        return this.telegramPairingTokensRepository.findOne({
            where: {
                tokenHash: this.hashPairingToken(plainToken),
            },
        });
    }
    async invalidateActivePairingTokens(phone) {
        const activeTokens = await this.telegramPairingTokensRepository.find({
            where: {
                phone,
                consumedAt: (0, typeorm_2.IsNull)(),
            },
        });
        if (activeTokens.length === 0) {
            return;
        }
        const now = new Date();
        for (const token of activeTokens) {
            if (token.expiresAt.getTime() > now.getTime()) {
                token.consumedAt = now;
            }
        }
        await this.telegramPairingTokensRepository.save(activeTokens);
    }
    normalizeTelegramPhoneInput(phone) {
        const trimmed = phone.trim();
        if (!trimmed) {
            return (0, contact_utils_1.normalizePhone)(trimmed);
        }
        if (trimmed.startsWith("+")) {
            return (0, contact_utils_1.normalizePhone)(trimmed);
        }
        return (0, contact_utils_1.normalizePhone)(`+${trimmed.replace(/[^\d]/g, "")}`);
    }
    generatePairingToken() {
        return (0, node_crypto_1.randomBytes)(32).toString("base64url");
    }
    hashPairingToken(token) {
        return (0, node_crypto_1.createHash)("sha256").update(token).digest("hex");
    }
    async sendGenericStartMessage(chatId) {
        await this.callTelegram("sendMessage", {
            chat_id: chatId,
            text: "Для безопасной привязки лучше открыть этого бота из приложения. После этого нажмите кнопку ниже и отправьте свой номер.",
            reply_markup: JSON.stringify({
                keyboard: [
                    [
                        {
                            text: "Отправить свой номер телефона",
                            request_contact: true,
                        },
                    ],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
            }),
        });
    }
    async sendOpenFromAppMessage(chatId) {
        await this.callTelegram("sendMessage", {
            chat_id: chatId,
            text: "Откройте приложение и нажмите «Привязать Telegram», затем вернитесь сюда и отправьте свой контакт кнопкой Telegram.",
        });
    }
    async sendContactRequiredMessage(chatId) {
        await this.callTelegram("sendMessage", {
            chat_id: chatId,
            text: "Для завершения привязки отправьте свой номер именно кнопкой Telegram.",
        });
    }
    async sendTelegramIdentityRequiredMessage(chatId) {
        await this.callTelegram("sendMessage", {
            chat_id: chatId,
            text: "Telegram не передал идентификатор пользователя. Попробуйте открыть бота напрямую в мобильном Telegram.",
        });
    }
    async sendRelinkBlockedMessage(chatId) {
        await this.callTelegram("sendMessage", {
            chat_id: chatId,
            text: "Этот номер уже привязан к другому Telegram-аккаунту. Автоперепривязка отключена.",
        });
    }
    async pollOnce() {
        const token = (0, runtime_config_1.getTelegramBotToken)();
        if (!token) {
            this.polling = false;
            return;
        }
        try {
            const response = await this.callTelegram("getUpdates", {
                offset: this.lastUpdateID + 1,
                timeout: 25,
            });
            const updates = Array.isArray(response.result)
                ? response.result
                : [];
            for (const update of updates) {
                this.lastUpdateID = Math.max(this.lastUpdateID, update.update_id);
                await this.handleUpdate(update);
            }
        }
        catch (error) {
            this.logger.error("Telegram polling failed", error);
        }
        finally {
            this.pollingTimer = setTimeout(() => {
                void this.pollOnce();
            }, 1000);
        }
    }
    async callTelegram(method, payload) {
        const token = (0, runtime_config_1.getTelegramBotToken)();
        if (!token) {
            throw new sms_types_1.SmsProviderUnavailableError("Telegram bot is not configured");
        }
        const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const body = await response.text();
            this.logger.error(`Telegram API ${method} failed: status=${response.status} body=${body.slice(0, 200)}`);
            throw new sms_types_1.SmsProviderUnavailableError("Telegram provider unavailable");
        }
        const json = (await response.json());
        if (!json.ok) {
            throw new sms_types_1.SmsProviderUnavailableError("Telegram provider unavailable");
        }
        return json;
    }
};
exports.TelegramBotService = TelegramBotService;
exports.TelegramBotService = TelegramBotService = TelegramBotService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(telegram_link_entity_1.TelegramLinkEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(telegram_pairing_token_entity_1.TelegramPairingTokenEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        auth_rate_limit_service_1.AuthRateLimitService])
], TelegramBotService);
//# sourceMappingURL=telegram-bot.service.js.map