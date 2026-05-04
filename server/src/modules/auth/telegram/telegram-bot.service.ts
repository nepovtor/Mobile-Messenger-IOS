import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes } from "node:crypto";
import { IsNull, MoreThan, Repository } from "typeorm";
import { TelegramLinkEntity } from "../../../entities/telegram-link.entity";
import { TelegramPairingTokenEntity } from "../../../entities/telegram-pairing-token.entity";
import { normalizePhone } from "../../common/contact.utils";
import {
  getAuthCodeTTLSeconds,
  getTelegramBotToken,
  getTelegramBotUsername,
  getTelegramLinkResendCooldownSeconds,
  getTelegramPairingTokenTTLSeconds,
  getVerificationProvider,
  hasTelegramBotConfig,
  isProductionEnv,
  isTelegramOwnContactRequired,
  isTelegramRelinkAllowed,
  isTelegramTextPhoneLinkingAllowed,
} from "../../common/runtime-config";
import { AuthRateLimitService } from "../auth-rate-limit.service";
import {
  SmsProviderUnavailableError,
  SmsService,
  TelegramNotLinkedError,
} from "../sms/sms.types";

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: {
      id: number | string;
      username?: string;
      first_name?: string;
    };
    from?: {
      id: number;
      username?: string;
      first_name?: string;
    };
    contact?: {
      phone_number?: string;
      first_name?: string;
      user_id?: number;
    };
  };
};

type TelegramMessageContext = {
  chatId: string;
  telegramUserId: string | null;
  username: string | null;
  firstName: string | null;
};

@Injectable()
export class TelegramBotService
  implements OnModuleInit, OnModuleDestroy, SmsService
{
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly pairingTokenTTLSeconds = getTelegramPairingTokenTTLSeconds();
  private readonly linkResendCooldownSeconds =
    getTelegramLinkResendCooldownSeconds();
  private pollingTimer: NodeJS.Timeout | null = null;
  private lastUpdateID = 0;
  private polling = false;

  constructor(
    @InjectRepository(TelegramLinkEntity)
    private readonly telegramLinksRepository: Repository<TelegramLinkEntity>,
    @InjectRepository(TelegramPairingTokenEntity)
    private readonly telegramPairingTokensRepository: Repository<TelegramPairingTokenEntity>,
    private readonly authRateLimitService: AuthRateLimitService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    await this.startBot();
  }

  onModuleDestroy(): void {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  async startBot(): Promise<void> {
    if (getVerificationProvider() !== "telegram") {
      return;
    }

    if (!hasTelegramBotConfig()) {
      const message =
        "Telegram verification provider is configured, but TELEGRAM_BOT_TOKEN is missing";
      if (isProductionEnv()) {
        this.logger.error(message);
      } else {
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

  async createPairingLink(
    rawPhone: string,
    requestContext?: {
      requestIP?: string | null;
      userAgent?: string | null;
    },
  ): Promise<{
    botUsername: string;
    telegramStartUrl: string;
    expiresIn: number;
  }> {
    const botUsername = getTelegramBotUsername();
    if (!hasTelegramBotConfig() || !botUsername) {
      throw new ServiceUnavailableException("Telegram pairing unavailable");
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
    await this.telegramPairingTokensRepository.save(
      this.telegramPairingTokensRepository.create({
        tokenHash: this.hashPairingToken(plainToken),
        phone,
        expiresAt: new Date(now + this.pairingTokenTTLSeconds * 1000),
        consumedAt: null,
        chatId: null,
        telegramUserId: null,
        attempts: 0,
      }),
    );

    return {
      botUsername,
      telegramStartUrl: `https://t.me/${botUsername}?start=${encodeURIComponent(
        plainToken,
      )}`,
      expiresIn: this.pairingTokenTTLSeconds,
    };
  }

  async sendVerificationCode(phone: string, code: string): Promise<void> {
    const token = getTelegramBotToken();
    if (!token) {
      throw new SmsProviderUnavailableError("Telegram bot is not configured");
    }

    const link = await this.findActiveLinkByPhone(phone);
    if (!link?.chatId) {
      throw new TelegramNotLinkedError();
    }

    if (!link.telegramUserId) {
      this.logger.warn(
        `Telegram link for ${phone} does not have telegramUserId yet; allowing delivery for backward compatibility`,
      );
    }

    link.lastVerifiedAt = new Date();
    await this.telegramLinksRepository.save(link);

    await this.callTelegram("sendMessage", {
      chat_id: link.chatId,
      text: `Ваш код входа в Mobile Messenger: ${code}. Код действует ${Math.ceil(
        getAuthCodeTTLSeconds() / 60,
      )} минут.`,
    });
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
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

    const pendingPairing =
      context.telegramUserId === null
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

    if (!isTelegramTextPhoneLinkingAllowed()) {
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
    } catch {
      await this.callTelegram("sendMessage", {
        chat_id: context.chatId,
        text: "Введите номер в международном формате, например +375291234567.",
      });
    }
  }

  private async handleSecureStart(
    plainToken: string,
    context: TelegramMessageContext,
  ): Promise<void> {
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

    if (
      (pairingToken.chatId && pairingToken.chatId !== context.chatId) ||
      (pairingToken.telegramUserId &&
        pairingToken.telegramUserId !== context.telegramUserId)
    ) {
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

  private async handleContactMessage(
    message: NonNullable<TelegramUpdate["message"]>,
    context: TelegramMessageContext,
    pendingPairing: TelegramPairingTokenEntity | null,
  ): Promise<void> {
    if (!context.telegramUserId) {
      await this.sendTelegramIdentityRequiredMessage(context.chatId);
      return;
    }

    if (isTelegramOwnContactRequired()) {
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
      const phone = this.normalizeTelegramPhoneInput(
        message.contact?.phone_number ?? "",
      );

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

      if (isProductionEnv()) {
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
    } catch {
      await this.callTelegram("sendMessage", {
        chat_id: context.chatId,
        text: "Введите номер в международном формате, например +375291234567.",
      });
    }
  }

  private async upsertTelegramLink(input: {
    phone: string;
    chatId: string;
    telegramUserId: string;
    username: string | null;
    firstName: string | null;
    markVerifiedAt: Date | null;
  }): Promise<"linked" | "relink_blocked"> {
    const existingLink = await this.telegramLinksRepository.findOne({
      where: { phone: input.phone },
    });

    if (!existingLink) {
      await this.telegramLinksRepository.save(
        this.telegramLinksRepository.create({
          phone: input.phone,
          chatId: input.chatId,
          telegramUserId: input.telegramUserId,
          username: input.username,
          firstName: input.firstName,
          lastVerifiedAt: input.markVerifiedAt,
          revokedAt: null,
        }),
      );
      return "linked";
    }

    const sameBinding =
      existingLink.chatId === input.chatId &&
      (existingLink.telegramUserId === input.telegramUserId ||
        existingLink.telegramUserId === null);
    const relinkAttempt = !sameBinding && !existingLink.revokedAt;

    if (relinkAttempt && !isTelegramRelinkAllowed()) {
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

  private buildMessageContext(
    message: NonNullable<TelegramUpdate["message"]>,
  ): TelegramMessageContext {
    return {
      chatId: String(message.chat.id),
      telegramUserId:
        typeof message.from?.id === "number" ? String(message.from.id) : null,
      username: message.from?.username ?? message.chat.username ?? null,
      firstName:
        message.contact?.first_name ??
        message.from?.first_name ??
        message.chat.first_name ??
        null,
    };
  }

  private extractStartToken(text?: string): string | null {
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

  private async findActiveLinkByPhone(
    phone: string,
  ): Promise<TelegramLinkEntity | null> {
    return this.telegramLinksRepository.findOne({
      where: {
        phone,
        revokedAt: IsNull(),
      },
    });
  }

  private async findPendingPairing(
    chatId: string,
    telegramUserId: string,
  ): Promise<TelegramPairingTokenEntity | null> {
    return this.telegramPairingTokensRepository.findOne({
      where: {
        chatId,
        telegramUserId,
        consumedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: "DESC" },
    });
  }

  private async findPairingToken(
    plainToken: string,
  ): Promise<TelegramPairingTokenEntity | null> {
    return this.telegramPairingTokensRepository.findOne({
      where: {
        tokenHash: this.hashPairingToken(plainToken),
      },
    });
  }

  private async invalidateActivePairingTokens(phone: string): Promise<void> {
    const activeTokens = await this.telegramPairingTokensRepository.find({
      where: {
        phone,
        consumedAt: IsNull(),
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

  private normalizeTelegramPhoneInput(phone: string): string {
    const trimmed = phone.trim();
    if (!trimmed) {
      return normalizePhone(trimmed);
    }

    if (trimmed.startsWith("+")) {
      return normalizePhone(trimmed);
    }

    return normalizePhone(`+${trimmed.replace(/[^\d]/g, "")}`);
  }

  private generatePairingToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private hashPairingToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async sendGenericStartMessage(chatId: string): Promise<void> {
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

  private async sendOpenFromAppMessage(chatId: string): Promise<void> {
    await this.callTelegram("sendMessage", {
      chat_id: chatId,
      text: "Откройте приложение и нажмите «Привязать Telegram», затем вернитесь сюда и отправьте свой контакт кнопкой Telegram.",
    });
  }

  private async sendContactRequiredMessage(chatId: string): Promise<void> {
    await this.callTelegram("sendMessage", {
      chat_id: chatId,
      text: "Для завершения привязки отправьте свой номер именно кнопкой Telegram.",
    });
  }

  private async sendTelegramIdentityRequiredMessage(chatId: string) {
    await this.callTelegram("sendMessage", {
      chat_id: chatId,
      text: "Telegram не передал идентификатор пользователя. Попробуйте открыть бота напрямую в мобильном Telegram.",
    });
  }

  private async sendRelinkBlockedMessage(chatId: string): Promise<void> {
    await this.callTelegram("sendMessage", {
      chat_id: chatId,
      text: "Этот номер уже привязан к другому Telegram-аккаунту. Автоперепривязка отключена.",
    });
  }

  private async pollOnce(): Promise<void> {
    const token = getTelegramBotToken();
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
        ? (response.result as TelegramUpdate[])
        : [];

      for (const update of updates) {
        this.lastUpdateID = Math.max(this.lastUpdateID, update.update_id);
        await this.handleUpdate(update);
      }
    } catch (error) {
      this.logger.error("Telegram polling failed", error as Error);
    } finally {
      this.pollingTimer = setTimeout(() => {
        void this.pollOnce();
      }, 1000);
    }
  }

  private async callTelegram(
    method: string,
    payload: Record<string, string | number | boolean>,
  ): Promise<{ ok: boolean; result?: unknown }> {
    const token = getTelegramBotToken();
    if (!token) {
      throw new SmsProviderUnavailableError("Telegram bot is not configured");
    }

    const response = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(
        `Telegram API ${method} failed: status=${response.status} body=${body.slice(0, 200)}`,
      );
      throw new SmsProviderUnavailableError("Telegram provider unavailable");
    }

    const json = (await response.json()) as {
      ok: boolean;
      result?: unknown;
    };

    if (!json.ok) {
      throw new SmsProviderUnavailableError("Telegram provider unavailable");
    }

    return json;
  }
}
