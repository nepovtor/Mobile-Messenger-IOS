import { httpRequest } from "./httpClient";
import type {
  DeleteWebPushSubscriptionPayload,
  PushStatusResponse,
  RegisterWebPushSubscriptionPayload,
  VapidPublicKeyResponse,
} from "../types/push";

export const pushApi = {
  getVapidPublicKey() {
    return httpRequest<VapidPublicKeyResponse>("/push/vapid-public-key", {
      authMode: "none",
    });
  },
  getStatus() {
    return httpRequest<PushStatusResponse>("/push/status");
  },
  registerWebSubscription(payload: RegisterWebPushSubscriptionPayload) {
    return httpRequest<{ ok: true }>("/push/subscriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteWebSubscription(payload: DeleteWebPushSubscriptionPayload) {
    return httpRequest<{ ok: true }>("/push/subscriptions/delete", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
