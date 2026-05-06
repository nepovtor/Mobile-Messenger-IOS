import { create } from "zustand";
import { pushApi } from "../api/pushApi";
import { toastStore } from "./toastStore";

export type PushCapabilityState =
  | "unsupported"
  | "denied"
  | "disabled"
  | "enabled";

type PushStore = {
  capabilityState: PushCapabilityState;
  permission: NotificationPermission | "unsupported";
  isSupported: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  isServerConfigured: boolean;
  activeSubscriptionCount: number;
  lastKnownEndpoint: string | null;
  initialize: () => Promise<void>;
  syncForAuthenticatedUser: () => Promise<void>;
  detachFromCurrentSession: () => Promise<void>;
  enable: () => Promise<boolean>;
  disable: () => Promise<boolean>;
  refreshStatus: () => Promise<void>;
};

function arePushNotificationsSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function ensureServiceWorkerRegistration() {
  const existingRegistration = await navigator.serviceWorker.getRegistration();
  if (existingRegistration) {
    return existingRegistration;
  }

  return navigator.serviceWorker.register("/sw.js");
}

async function getServiceWorkerRegistration(options?: {
  registerIfMissing?: boolean;
}) {
  const existingRegistration = await navigator.serviceWorker.getRegistration();
  if (existingRegistration || options?.registerIfMissing === false) {
    return existingRegistration ?? null;
  }

  return navigator.serviceWorker.register("/sw.js");
}

function getPermissionState(): NotificationPermission | "unsupported" {
  if (!("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

function getCapabilityState(
  permission: NotificationPermission | "unsupported",
  hasSubscription: boolean,
): PushCapabilityState {
  if (permission === "unsupported") {
    return "unsupported";
  }

  if (permission === "denied") {
    return "denied";
  }

  return hasSubscription ? "enabled" : "disabled";
}

function encodeSubscription(subscription: PushSubscription) {
  const serialized = subscription.toJSON();
  const p256dh = serialized.keys?.p256dh;
  const auth = serialized.keys?.auth;

  if (!p256dh || !auth) {
    throw new Error("Браузер не передал ключи push-подписки.");
  }

  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh,
      auth,
    },
    userAgent: navigator.userAgent,
  };
}

function decodeBase64Url(input: string) {
  const padding = "=".repeat((4 - (input.length % 4)) % 4);
  const base64 = `${input}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);

  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function loadExistingSubscription() {
  const registration = await getServiceWorkerRegistration({
    registerIfMissing: false,
  });
  if (!registration) {
    return null;
  }

  return registration.pushManager.getSubscription();
}

async function getConfiguredVapidKey() {
  const response = await pushApi.getVapidPublicKey();
  if (!response.configured || !response.publicKey) {
    throw new Error("Web push пока не настроен на сервере.");
  }

  return response.publicKey;
}

async function syncSubscriptionWithBackend(
  subscription: PushSubscription | null,
) {
  if (!subscription) {
    return;
  }

  await pushApi.registerWebSubscription(encodeSubscription(subscription));
}

export const pushStore = create<PushStore>((set, get) => ({
  capabilityState: "unsupported",
  permission: "unsupported",
  isSupported: false,
  isLoading: false,
  isInitialized: false,
  isServerConfigured: false,
  activeSubscriptionCount: 0,
  lastKnownEndpoint: null,
  async initialize() {
    if (!arePushNotificationsSupported()) {
      set({
        isInitialized: true,
        isSupported: false,
        permission: "unsupported",
        capabilityState: "unsupported",
        lastKnownEndpoint: null,
      });
      return;
    }

    const permission = getPermissionState();
    const subscription = await loadExistingSubscription();

    set({
      isInitialized: true,
      isSupported: true,
      permission,
      capabilityState: getCapabilityState(permission, Boolean(subscription)),
      lastKnownEndpoint: subscription?.endpoint ?? null,
    });
  },
  async refreshStatus() {
    if (!get().isSupported) {
      return;
    }

    try {
      const [status, subscription] = await Promise.all([
        pushApi.getStatus(),
        loadExistingSubscription(),
      ]);
      const permission = getPermissionState();

      set({
        permission,
        capabilityState: getCapabilityState(permission, Boolean(subscription)),
        isServerConfigured: status.webPush.configured,
        activeSubscriptionCount: status.webPush.activeSubscriptionCount,
        lastKnownEndpoint: subscription?.endpoint ?? null,
      });
    } catch {
      const subscription = await loadExistingSubscription().catch(() => null);
      const permission = getPermissionState();
      set({
        permission,
        capabilityState: getCapabilityState(permission, Boolean(subscription)),
        lastKnownEndpoint: subscription?.endpoint ?? null,
      });
    }
  },
  async syncForAuthenticatedUser() {
    if (!get().isSupported) {
      return;
    }

    try {
      await get().refreshStatus();
      const subscription = await loadExistingSubscription();
      await syncSubscriptionWithBackend(subscription);

      if (subscription) {
        set({
          capabilityState: "enabled",
          lastKnownEndpoint: subscription.endpoint,
        });
      }
    } catch {
      void 0;
    }
  },
  async detachFromCurrentSession() {
    const subscription = arePushNotificationsSupported()
      ? await loadExistingSubscription().catch(() => null)
      : null;
    const endpoint = subscription?.endpoint ?? get().lastKnownEndpoint;
    if (!endpoint) {
      return;
    }

    try {
      await pushApi.deleteWebSubscription({ endpoint });
    } catch {
      void 0;
    }
  },
  async enable() {
    if (!arePushNotificationsSupported()) {
      set({
        isSupported: false,
        permission: "unsupported",
        capabilityState: "unsupported",
      });
      return false;
    }

    set({ isLoading: true, isSupported: true });

    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      if (permission !== "granted") {
        set({
          isLoading: false,
          permission,
          capabilityState:
            permission === "denied" ? "denied" : "disabled",
        });

        if (permission === "denied") {
          toastStore.getState().showToast({
            tone: "warning",
            title: "Push-уведомления",
            message:
              "Разрешение на уведомления отклонено в браузере.",
            dedupeKey: "push-permission-denied",
          });
        }

        return false;
      }

      const publicKey = await getConfiguredVapidKey();
      const registration = await ensureServiceWorkerRegistration();
      const existingSubscription =
        await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeBase64Url(publicKey),
        }));

      await syncSubscriptionWithBackend(subscription);
      await get().refreshStatus();

      set({
        isLoading: false,
        permission,
        capabilityState: "enabled",
        lastKnownEndpoint: subscription.endpoint,
      });

      toastStore.getState().showToast({
        tone: "success",
        title: "Push-уведомления",
        message: "Push-уведомления включены.",
        dedupeKey: "push-enabled",
      });
      return true;
    } catch (error) {
      set({ isLoading: false });
      toastStore.getState().showToast({
        tone: "danger",
        title: "Push-уведомления",
        message: mapPushErrorMessage(
          error,
          "Не удалось включить push-уведомления.",
        ),
      });
      return false;
    }
  },
  async disable() {
    if (!get().isSupported) {
      return false;
    }

    set({ isLoading: true });

    try {
      const registration = await ensureServiceWorkerRegistration();
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await pushApi.deleteWebSubscription({
          endpoint: subscription.endpoint,
        });
        await subscription.unsubscribe();
      }

      await get().refreshStatus();
      set({
        isLoading: false,
        capabilityState: "disabled",
        lastKnownEndpoint: null,
      });

      toastStore.getState().showToast({
        tone: "info",
        title: "Push-уведомления",
        message: "Push-уведомления отключены.",
        dedupeKey: "push-disabled",
      });
      return true;
    } catch (error) {
      set({ isLoading: false });
      toastStore.getState().showToast({
        tone: "danger",
        title: "Push-уведомления",
        message: mapPushErrorMessage(
          error,
          "Не удалось отключить push-уведомления.",
        ),
      });
      return false;
    }
  },
}));

function mapPushErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && /[А-Яа-яЁё]/.test(error.message)) {
    return error.message;
  }

  return fallback;
}
