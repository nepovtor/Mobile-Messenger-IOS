import { Injectable } from "@nestjs/common";
import * as webpush from "web-push";
import { appLogger } from "../common/app-logger";
import {
  getWebPushVapidPrivateKey,
  getWebPushVapidPublicKey,
  getWebPushVapidSubject,
  hasWebPushConfig,
} from "../common/runtime-config";
import type {
  GenericPushPayload,
  PushDeliveryResult,
  WebPushTarget,
} from "./push.types";

@Injectable()
export class WebPushProvider {
  private readonly configured = hasWebPushConfig();
  private didLogMissingConfig = false;

  constructor() {
    if (this.configured) {
      webpush.setVapidDetails(
        getWebPushVapidSubject(),
        getWebPushVapidPublicKey(),
        getWebPushVapidPrivateKey(),
      );
      return;
    }

    this.logMissingConfig();
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getPublicKey(): string | null {
    return this.configured ? getWebPushVapidPublicKey() : null;
  }

  async send(
    target: WebPushTarget,
    payload: GenericPushPayload,
  ): Promise<PushDeliveryResult> {
    if (!this.configured) {
      this.logMissingConfig();
      return {
        ok: false,
        reason: "Web Push is not configured.",
      };
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: {
            p256dh: target.p256dh,
            auth: target.auth,
          },
        },
        JSON.stringify(payload),
      );
      return { ok: true };
    } catch (error) {
      const details = error as {
        statusCode?: number;
        body?: string;
        message?: string;
      };

      return {
        ok: false,
        statusCode: details.statusCode,
        reason: details.body || details.message || "Web Push delivery failed.",
        invalidToken: details.statusCode === 404 || details.statusCode === 410,
      };
    }
  }

  private logMissingConfig() {
    if (this.didLogMissingConfig) {
      return;
    }

    this.didLogMissingConfig = true;
    void appLogger.info(
      "push.web",
      "Web Push is disabled because VAPID configuration is missing.",
    );
  }
}
