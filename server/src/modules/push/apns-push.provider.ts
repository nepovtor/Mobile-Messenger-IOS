import { Injectable, OnModuleDestroy } from "@nestjs/common";
import apn from "apn";
import type { Provider } from "apn";
import type { PushEnvironment } from "../../entities/push-subscription.entity";
import { appLogger } from "../common/app-logger";
import { getApnsConfig } from "../common/runtime-config";
import type {
  IosPushTarget,
  MessageCreatedPushPayload,
  PushDeliveryResult,
} from "./push.types";

const INVALID_APNS_REASONS = new Set([
  "BadDeviceToken",
  "DeviceTokenNotForTopic",
  "Unregistered",
]);

@Injectable()
export class ApnsPushProvider implements OnModuleDestroy {
  private readonly config = getApnsConfig();
  private readonly providers = new Map<PushEnvironment, Provider>();
  private didLogMissingConfig = false;

  isConfigured(): boolean {
    return Boolean(this.config);
  }

  async send(
    target: IosPushTarget,
    payload: MessageCreatedPushPayload,
  ): Promise<PushDeliveryResult> {
    if (!this.config) {
      this.logMissingConfig();
      return {
        ok: false,
        reason: "APNs is not configured.",
      };
    }

    const provider = this.getProvider(target.environment);
    const notification = new apn.Notification();
    notification.topic = target.bundleId || this.config.bundleId;
    notification.sound = "default";
    notification.alert = {
      title: payload.title,
      body: payload.body,
    };
    if (payload.badge != null) {
      notification.badge = payload.badge;
    }
    notification.payload = {
      type: payload.type,
      chatId: payload.chatId,
      messageId: payload.messageId,
      url: payload.url,
    };

    try {
      const response = await provider.send(notification, target.deviceToken);
      const failure = response.failed[0];
      if (!failure) {
        return { ok: true };
      }

      const reason =
        failure.response?.reason ||
        failure.error?.message ||
        failure.status ||
        "APNs delivery failed.";
      return {
        ok: false,
        reason,
        invalidToken: INVALID_APNS_REASONS.has(reason),
      };
    } catch (error) {
      return {
        ok: false,
        reason:
          error instanceof Error ? error.message : "APNs delivery failed.",
      };
    }
  }

  onModuleDestroy(): void {
    for (const provider of this.providers.values()) {
      provider.shutdown();
    }
    this.providers.clear();
  }

  private getProvider(environment: PushEnvironment): Provider {
    const existing = this.providers.get(environment);
    if (existing) {
      return existing;
    }

    if (!this.config) {
      throw new Error("APNs is not configured.");
    }

    const provider = new apn.Provider({
      token: {
        key: this.config.privateKey,
        keyId: this.config.keyId,
        teamId: this.config.teamId,
      },
      production: environment === "production",
    });
    this.providers.set(environment, provider);
    return provider;
  }

  private logMissingConfig() {
    if (this.didLogMissingConfig) {
      return;
    }

    this.didLogMissingConfig = true;
    void appLogger.info(
      "push.apns",
      "APNs is disabled because Apple push credentials are missing.",
    );
  }
}
