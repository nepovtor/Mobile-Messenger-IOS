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
