import { isIP } from "node:net";
import { BadRequestException, Injectable } from "@nestjs/common";
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
  GenericPushPayload,
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
    assertSafeWebPushEndpoint(dto.endpoint);
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
    assertSafeWebPushEndpoint(dto.endpoint);
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
    const normalizedToken = normalizeApnsToken(dto.token);
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
    const normalizedToken = normalizeApnsToken(token);
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
    await this.deliverGenericNotification(null, [user.sub]);
    return { ok: true };
  }

  async notifyMessageCreated(input: {
    authorUserId: string;
    participantUserIds: string[];
    payload: MessageCreatedPushPayload;
  }): Promise<void> {
    await this.deliverGenericNotification(
      input.authorUserId,
      input.participantUserIds,
      input.payload.badge,
    );
  }

  private async deliverGenericNotification(
    excludedUserID: string | null,
    participantUserIDs: string[],
    badge?: number,
  ): Promise<void> {
    const genericPayload = buildGenericPushPayload(badge);
    const recipientUserIds = Array.from(
      new Set(participantUserIDs.filter((userID) => userID !== excludedUserID)),
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
        this.deliverTelegramNotification(recipient.chatId),
      ),
    );

    const deliveries = nonTelegramSubscriptions.map(async (subscription) => {
      if (subscription.platform === PushPlatform.WEB) {
        await this.deliverWebPush(subscription, genericPayload);
        return;
      }

      if (subscription.platform === PushPlatform.IOS) {
        await this.deliverIosPush(subscription, genericPayload);
      }
    });

    await Promise.allSettled(deliveries);
  }

  private async deliverWebPush(
    subscription: PushSubscriptionEntity,
    payload: GenericPushPayload,
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
      await this.disableSubscription(subscription);
      return;
    }

    if (!this.webPushProvider.isConfigured()) {
      return;
    }

    void appLogger.error(
      "push.web",
      "Web Push delivery failed",
      new Error("Push provider rejected delivery"),
      {
        subscriptionId: subscription.id,
        statusCode: result.statusCode ?? null,
      },
    );
  }

  private async deliverIosPush(
    subscription: PushSubscriptionEntity,
    payload: GenericPushPayload,
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
      await this.disableSubscription(subscription);
      return;
    }

    if (!this.apnsPushProvider.isConfigured()) {
      return;
    }

    void appLogger.error(
      "push.apns",
      "APNs delivery failed",
      new Error("Push provider rejected delivery"),
      {
        subscriptionId: subscription.id,
      },
    );
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

  private async deliverTelegramNotification(chatId: string): Promise<void> {
    const buttonUrl = buildTelegramNotificationUrl();

    try {
      await this.telegramBotService.sendMessage(
        chatId,
        buildTelegramNotificationText(buttonUrl),
        buttonUrl
          ? {
              parseMode: "HTML",
              disableWebPagePreview: true,
              inlineButtonText: "Открыть чат",
              inlineButtonUrl: buttonUrl,
            }
          : undefined,
      );
    } catch {
      void appLogger.error(
        "push.telegram",
        "Telegram notification delivery failed",
        new Error("Push provider rejected delivery"),
      );
    }
  }

  private async disableSubscription(subscription: PushSubscriptionEntity) {
    subscription.disabledAt = new Date();
    await this.pushSubscriptionsRepository.save(subscription);
    void appLogger.info(
      "push",
      "Push subscription disabled after provider rejection.",
      {
        subscriptionId: subscription.id,
        platform: subscription.platform,
      },
    );
  }
}

function buildGenericPushPayload(badge?: number): GenericPushPayload {
  return {
    type: "message.available",
    ...(badge == null ? {} : { badge }),
  };
}

function buildTelegramNotificationText(buttonUrl: string | null): string {
  const summary = "Новое сообщение в Mobile Messenger";

  if (!buttonUrl) {
    return summary;
  }

  return `<a href="${escapeTelegramHtml(buttonUrl)}">${escapeTelegramHtml(summary)}</a>`;
}

function buildTelegramNotificationUrl(): string | null {
  const webAppUrl = getWebAppUrl();
  if (!webAppUrl) {
    return null;
  }

  return new URL("messenger", `${webAppUrl}/`).toString();
}

function escapeTelegramHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function assertSafeWebPushEndpoint(value: string): void {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new BadRequestException("Invalid Web Push endpoint");
  }

  const hostname = endpoint.hostname.toLowerCase().replace(/\.$/, "");
  if (
    endpoint.protocol !== "https:" ||
    Boolean(endpoint.username) ||
    Boolean(endpoint.password) ||
    (endpoint.port !== "" && endpoint.port !== "443") ||
    isIP(hostname) !== 0 ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new BadRequestException("Web Push endpoint is not allowed");
  }
}

function normalizeApnsToken(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{16,200}$/.test(normalized)) {
    throw new BadRequestException("Invalid APNs device token");
  }
  return normalized;
}
