import { httpRequest } from "@/shared/api/httpClient";
import { apiPath } from "@/shared/api/generated/apiContract";
import type {
  DeleteWebPushSubscriptionPayload,
  PushStatusResponse,
  RegisterWebPushSubscriptionPayload,
  VapidPublicKeyResponse,
} from "@/features/push/types/push";

export const pushApi = {
  getVapidPublicKey() {
    return httpRequest<VapidPublicKeyResponse>(apiPath("getVapidPublicKey"), {
      authMode: "none",
    });
  },
  getStatus() {
    return httpRequest<PushStatusResponse>(apiPath("getPushStatus"));
  },
  registerWebSubscription(payload: RegisterWebPushSubscriptionPayload) {
    return httpRequest<{ ok: true }>(apiPath("registerPushSubscription"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteWebSubscription(payload: DeleteWebPushSubscriptionPayload) {
    return httpRequest<{ ok: true }>(
      apiPath("deletePushSubscriptionFallback"),
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },
};
