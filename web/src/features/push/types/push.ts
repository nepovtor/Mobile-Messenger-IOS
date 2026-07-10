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

export type VapidPublicKeyResponse = {
  configured: boolean;
  publicKey: string | null;
};

export type RegisterWebPushSubscriptionPayload = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
};

export type DeleteWebPushSubscriptionPayload = {
  endpoint: string;
};
