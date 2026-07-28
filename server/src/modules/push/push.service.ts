import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import {
  PushEnvironment,
  PushPlatform,
  PushSubscriptionEntity,
} from "../../entities/push-subscription.entity";
import { TelegramLinkEntity } from "../../entities/telegram-link.entity";
import { UserEntity } from "../../entities/user.entity";
import { TelegramBotService } from "../auth/telegram/telegram-bot.service";
import { appLogger } from "../common/app-logger";
import { AuthenticatedUser } from "../common/authenticated-user";
import { getWebAppUrl } from "../common/runtime-config";
import { DeleteWebPushSubscriptionDto } from "./dto/delete-web-push-subscription.dto";
import { RegisterIosPushDeviceDto } from "./dto/register-ios-push-device.dto";
import { RegisterWebPushSubscriptionDto } from "./dto/register-web-push-subscription.dto";
import { ApnsPushProvider } from "./apns-push.provider";
import type {
  MessageCreatedPushPayload,
  PushStatusResponse,
} from "./push.types";
import { WebPushProvider } from "./web-push.provider";

@Injectable()
export class PushService {
  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private readonly pushSubscriptionsRepository: Repository<PushSubscriptionEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(TelegramLinkEntity)
    private readonly telegramLinksRepository: Repository<TelegramLinkEntity>,
    private readonly webPushProvider: WebPushProvider,
    private readonly apnsPushProvider: ApnsPushProvider,
    private readonly telegramBotService: TelegramBotService,
  ) {}

  getVapidPublicKey() {
    return {
      configured: this.webPushProvider.isConfigured(),
      publicKey: this.webPushProvider.getPublicKey(),
    };
  }

  async getStatus(userId: string): Promise<PushStatusResponse> {
    const subscriptions = await this.pushSubscriptionsRepository.find({
      where: {
        userId,
        disabledAt: IsNull(),
      },
    });

    return {
      webPush: {
        configured: this.webPushProvider.isConfigured(),
        activeSubscriptionCount: subscriptions.filter(
          (subscription) => subscription.platform === PushPlatform.WEB,
        ).length,
      },
      iosPush: {
        configured: this.apnsPushProvider.isConfigured(),
        activeDeviceCount: subscriptions.filter(
          (subscription) => subscription.platform === PushPlatform.IOS,
        ).length,
      },
    };
  }

  async registerWebSubscription(
    user: AuthenticatedUser,
    dto: RegisterWebPushSubscriptionDto,
  ): Promise<{ ok: true }> {
    const existing = await this.pushSubscriptionsRepository.findOne({
      where: {
        endpoint: dto.endpoint,
      },
    });

    const subscription =
      existing ??
      this.pushSubscriptionsRepository.create({ endpoint: dto.endpoint });
    subscription.userId = user.sub;
    subscription.platform = PushPlatform.WEB;
    subscription.endpoint = dto.endpoint;
    subscription.p256dh = dto.keys.p256dh;
    subscription.auth = dto.keys.auth;
    subscription.userAgent = dto.userAgent ?? null;
    subscription.deviceToken = null;
    subscription.environment = null;
    subscription.bundleId = null;
    subscription.disabledAt = null;

    await this.pushSubscriptionsRepository.save(subscription);
    return { ok: true };
  }

  async deleteWebSubscription(
    userId: string,
    dto: DeleteWebPushSubscriptionDto,
  ): Promise<{ ok: true }> {
    const subscription = await this.pushSubscriptionsRepository.findOne({
      where: {
        userId,
        platform: PushPlatform.WEB,
        endpoint: dto.endpoint,
      },
    });

    if (!subscription) {
      return { ok: true };
    }

    subscription.disabledAt = new Date();
    await this.pushSubscriptionsRepository.save(subscription);
    return { ok: true };
  }

  async registerIosDevice(
    user: AuthenticatedUser,
    dto: RegisterIosPushDeviceDto,
  ): Promise<{ ok: true }> {
    const normalizedToken = dto.token.trim().toLowerCase();
    const existing = await this.pushSubscriptionsRepository.findOne({
      where: {
        deviceToken: normalizedToken,
      },
    });

    const device =
      existing ??
      this.pushSubscriptionsRepository.create({ deviceToken: normalizedToken });
    device.userId = user.sub;
    device.platform = PushPlatform.IOS;
    device.deviceToken = normalizedToken;
    device.environment = dto.environment ?? PushEnvironment.SANDBOX;
    device.bundleId = dto.bundleId.trim();
    device.endpoint = null;
    device.p256dh = null;
    device.auth = null;
    device.userAgent = null;
    device.disabledAt = null;

    await this.pushSubscriptionsRepository.save(device);
    return { ok: true };
  }

  async deleteIosDevice(userId: string, token: string): Promise<{ ok: true }> {
    const normalizedToken = token.trim().toLowerCase();
    const device = await this.pushSubscriptionsRepository.findOne({
      where: {
        userId,
        platform: PushPlatform.IOS,
        deviceToken: normalizedToken,
      },
    });

    if (!device) {
      return { ok: true };
    }

    device.disabledAt = new Date();
    await this.pushSubscriptionsRepository.save(device);
    return { ok: true };
  }

  async sendTestNotification(user: AuthenticatedUser): Promise<{ ok: true }> {
    await this.notifyMessageCreated({
      authorUserId: "system",
      participantUserIds: [user.sub],
      payload: {
        type: "message.created",
        chatId: "test-chat",
        messageId: "test-message",
        title: "Push test",
        body: "This is a test notification from Mobile Messenger.",
        url: "/messenger?chatId=test-chat",
      },
    });
    return { ok: true };
  }

  async notifyMessageCreated(input: {
    authorUserId: string;
    participantUserIds: string[];
    payload: MessageCreatedPushPayload;
  }): Promise<void> {
    const recipientUserIds = Array.from(
      new Set(
        input.participantUserIds.filter(
          (userId) => userId !== input.authorUserId,
        ),
      ),
    );

    if (recipientUserIds.length === 0) {
      return;
    }

    const subscriptions = await this.pushSubscriptionsRepository.find({
      where: recipientUserIds.map((userId) => ({
        userId,
        disabledAt: IsNull(),
      })),
    });
    const telegramRecipients =
      await this.resolvePreferredTelegramRecipients(recipientUserIds);
    const telegramRecipientUserIds = new Set<string>(
      telegramRecipients.map((recipient) => recipient.userId),
    );
    const nonTelegramSubscriptions = subscriptions.filter(
      (subscription) => !telegramRecipientUserIds.has(subscription.userId),
    );

    await Promise.allSettled(
      telegramRecipients.map((recipient) =>
        this.deliverTelegramNotification(recipient.chatId, input.payload),
      ),
    );

    const deliveries = nonTelegramSubscriptions.map(async (subscription) => {
      if (subscription.platform === PushPlatform.WEB) {
        await this.deliverWebPush(subscription, input.payload);
        return;
      }

      if (subscription.platform === PushPlatform.IOS) {
        await this.deliverIosPush(subscription, input.payload);
      }
    });

    await Promise.allSettled(deliveries);
  }

  private async deliverWebPush(
    subscription: PushSubscriptionEntity,
    payload: MessageCreatedPushPayload,
  ) {
    if (!subscription.endpoint || !subscription.p256dh || !subscription.auth) {
      return;
    }

    const result = await this.webPushProvider.send(
      {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
      payload,
    );

    if (result.ok) {
      return;
    }

    if (result.invalidToken) {
      await this.disableSubscription(subscription, result.reason);
      return;
    }

    if (!this.webPushProvider.isConfigured()) {
      return;
    }

    void appLogger.error(
      "push.web",
      "Web Push delivery failed",
      result.reason,
      {
        subscriptionId: subscription.id,
        endpoint: subscription.endpoint,
        statusCode: result.statusCode ?? null,
      },
    );
  }

  private async deliverIosPush(
    subscription: PushSubscriptionEntity,
    payload: MessageCreatedPushPayload,
  ) {
    if (
      !subscription.deviceToken ||
      !subscription.environment ||
      !subscription.bundleId
    ) {
      return;
    }

    const result = await this.apnsPushProvider.send(
      {
        deviceToken: subscription.deviceToken,
        environment: subscription.environment,
        bundleId: subscription.bundleId,
      },
      payload,
    );

    if (result.ok) {
      return;
    }

    if (result.invalidToken) {
      await this.disableSubscription(subscription, result.reason);
      return;
    }

    if (!this.apnsPushProvider.isConfigured()) {
      return;
    }

    void appLogger.error("push.apns", "APNs delivery failed", result.reason, {
      subscriptionId: subscription.id,
      deviceToken: subscription.deviceToken,
    });
  }

  private async resolvePreferredTelegramRecipients(
    recipientUserIds: string[],
  ): Promise<Array<{ userId: UserEntity["id"]; chatId: string }>> {
    if (!this.telegramBotService.isConfigured()) {
      return [];
    }

    const candidateUsers = await this.usersRepository.find({
      where: {
        id: In(recipientUserIds as UserEntity["id"][]),
      },
    });

    const candidatePhones = candidateUsers
      .filter((user) => Boolean(user.phone))
      .map((user) => user.phone)
      .filter((phone): phone is string => Boolean(phone));

    const links =
      candidatePhones.length > 0
        ? await this.telegramLinksRepository.find({
            where: candidatePhones.map((phone) => ({
              phone,
              revokedAt: IsNull(),
            })),
          })
        : [];

    const chatIdByPhone = new Map(
      links
        .filter((link) => Boolean(link.chatId))
        .map((link) => [link.phone, link.chatId] as const),
    );

    return candidateUsers
      .map((user) => {
        const chatId = user.phone
          ? (chatIdByPhone.get(user.phone) ?? null)
          : user.telegramChatId;
        return chatId ? { userId: user.id, chatId } : null;
      })
      .filter(
        (
          recipient,
        ): recipient is { userId: UserEntity["id"]; chatId: string } =>
          Boolean(recipient?.chatId),
      );
  }

  private async deliverTelegramNotification(
    chatId: string,
    payload: MessageCreatedPushPayload,
  ): Promise<void> {
    const buttonUrl = buildTelegramNotificationUrl(payload.url);

    try {
      await this.telegramBotService.sendMessage(
        chatId,
        buildTelegramNotificationText(payload, buttonUrl),
        buttonUrl
          ? {
              parseMode: "HTML",
              disableWebPagePreview: true,
              inlineButtonText: "Открыть чат",
              inlineButtonUrl: buttonUrl,
            }
          : undefined,
      );
    } catch (error) {
      void appLogger.error(
        "push.telegram",
        "Telegram notification delivery failed",
        error instanceof Error ? error.message : "Unknown Telegram error",
        {
          chatId,
        },
      );
    }
  }

  private async disableSubscription(
    subscription: PushSubscriptionEntity,
    reason: string,
  ) {
    subscription.disabledAt = new Date();
    await this.pushSubscriptionsRepository.save(subscription);
    void appLogger.info(
      "push",
      "Push subscription disabled after provider rejection.",
      {
        subscriptionId: subscription.id,
        platform: subscription.platform,
        reason,
      },
    );
  }
}

function buildTelegramNotificationText(
  payload: MessageCreatedPushPayload,
  buttonUrl: string | null,
): string {
  const summary = ["Новое сообщение в Mobile Messenger", payload.title]
    .filter(Boolean)
    .join("\n");

  if (!buttonUrl) {
    return summary;
  }

  return `<a href="${escapeTelegramHtml(buttonUrl)}">${escapeTelegramHtml(summary)}</a>`;
}

function buildTelegramNotificationUrl(relativeUrl: string): string | null {
  const webAppUrl = getWebAppUrl();
  if (!webAppUrl) {
    return null;
  }

  return new URL(relativeUrl, `${webAppUrl}/`).toString();
}

function escapeTelegramHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
