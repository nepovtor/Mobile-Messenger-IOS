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
const typeorm_2 = require("typeorm");
const telegram_link_entity_1 = require("../../../entities/telegram-link.entity");
const contact_utils_1 = require("../../common/contact.utils");
const runtime_config_1 = require("../../common/runtime-config");
const sms_types_1 = require("../sms/sms.types");
let TelegramBotService = TelegramBotService_1 = class TelegramBotService {
    constructor(telegramLinksRepository) {
        this.telegramLinksRepository = telegramLinksRepository;
        this.logger = new common_1.Logger(TelegramBotService_1.name);
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
    async sendVerificationCode(phone, code) {
        const token = (0, runtime_config_1.getTelegramBotToken)();
        if (!token) {
            throw new sms_types_1.SmsProviderUnavailableError("Telegram bot is not configured");
        }
        const link = await this.telegramLinksRepository.findOneBy({ phone });
        if (!link) {
            throw new sms_types_1.TelegramNotLinkedError();
        }
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
        const chatId = String(message.chat.id);
        const username = message.from?.username ?? message.chat.username ?? null;
        const firstName = message.contact?.first_name ??
            message.from?.first_name ??
            message.chat.first_name ??
            null;
        if (message.text?.trim() === "/start") {
            await this.callTelegram("sendMessage", {
                chat_id: chatId,
                text: "Отправьте свой номер телефона кнопкой Contact или введите номер в международном формате.",
                reply_markup: JSON.stringify({
                    keyboard: [
                        [
                            {
                                text: "Отправить номер телефона",
                                request_contact: true,
                            },
                        ],
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false,
                }),
            });
            return;
        }
        const rawPhone = message.contact?.phone_number ?? message.text?.trim();
        if (!rawPhone) {
            return;
        }
        try {
            const phone = (0, contact_utils_1.normalizePhone)(rawPhone.startsWith("+") ? rawPhone : `+${rawPhone.replace(/[^\d]/g, "")}`);
            const existingLink = await this.telegramLinksRepository.findOneBy({
                phone,
            });
            await this.telegramLinksRepository.save(existingLink
                ? {
                    ...existingLink,
                    chatId,
                    username,
                    firstName,
                }
                : this.telegramLinksRepository.create({
                    phone,
                    chatId,
                    username,
                    firstName,
                }));
            await this.callTelegram("sendMessage", {
                chat_id: chatId,
                text: "Номер привязан. Теперь вернитесь в приложение и запросите код.",
            });
        }
        catch {
            await this.callTelegram("sendMessage", {
                chat_id: chatId,
                text: "Введите номер в международном формате, например +375291234567.",
            });
        }
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
    __metadata("design:paramtypes", [typeorm_2.Repository])
], TelegramBotService);
//# sourceMappingURL=telegram-bot.service.js.map