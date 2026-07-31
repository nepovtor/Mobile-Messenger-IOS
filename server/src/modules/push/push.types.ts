import type {
  PushEnvironment,
  PushPlatform,
} from "../../entities/push-subscription.entity";

export type PushDeliveryResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      statusCode?: number;
      reason: string;
      invalidToken?: boolean;
    };

export type WebPushTarget = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type IosPushTarget = {
  deviceToken: string;
  bundleId: string;
  environment: PushEnvironment;
};

export type MessageCreatedPushPayload = {
  type: "message.created";
  chatId: string;
  messageId: string;
  title: string;
  body: string;
  url: string;
  badge?: number;
};

/**
 * The only payload permitted to leave the server through a push provider.
 * Message, sender, conversation, and routing identifiers intentionally stay
 * out of band and are fetched after the client authenticates.
 */
export type GenericPushPayload = {
  type: "message.available";
  badge?: number;
};

export type PushStatusResponse = {
  webPush: {
    configured: boolean;
    activeSubscriptionCount: number;
  };
  iosPush: {
    configured: boolean;
    activeDeviceCount: number;
  };
};

export type PushSubscriptionSummary = {
  platform: PushPlatform;
  userId: string;
};
