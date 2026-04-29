import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TelegramLinkEntity } from "../../../entities/telegram-link.entity";
import { normalizePhone } from "../../common/contact.utils";
import {
  getAuthCodeTTLSeconds,
  getTelegramBotToken,
  getVerificationProvider,
  hasTelegramBotConfig,
  isProductionEnv,
} from "../../common/runtime-config";
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

@Injectable()
export class TelegramBotService
  implements OnModuleInit, OnModuleDestroy, SmsService
{
  private readonly logger = new Logger(TelegramBotService.name);
  private pollingTimer: NodeJS.Timeout | null = null;
  private lastUpdateID = 0;
  private polling = false;

  constructor(
    @InjectRepository(TelegramLinkEntity)
    private readonly telegramLinksRepository: Repository<TelegramLinkEntity>,
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

  async sendVerificationCode(phone: string, code: string): Promise<void> {
    const token = getTelegramBotToken();
    if (!token) {
      throw new SmsProviderUnavailableError("Telegram bot is not configured");
    }

    const link = await this.telegramLinksRepository.findOneBy({ phone });
    if (!link) {
      throw new TelegramNotLinkedError();
    }

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
    const chatId = String(message.chat.id);
    const username = message.from?.username ?? message.chat.username ?? null;
    const firstName =
      message.contact?.first_name ??
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
      const phone = normalizePhone(
        rawPhone.startsWith("+") ? rawPhone : `+${rawPhone.replace(/[^\d]/g, "")}`,
      );
      const existingLink = await this.telegramLinksRepository.findOneBy({
        phone,
      });
      await this.telegramLinksRepository.save(
        existingLink
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
            }),
      );

      await this.callTelegram("sendMessage", {
        chat_id: chatId,
        text: "Номер привязан. Теперь вернитесь в приложение и запросите код.",
      });
    } catch {
      await this.callTelegram("sendMessage", {
        chat_id: chatId,
        text: "Введите номер в международном формате, например +375291234567.",
      });
    }
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
    payload: Record<string, string | number>,
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
