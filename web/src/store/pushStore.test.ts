import { beforeEach, describe, expect, it, vi } from "vitest";
import { pushApi } from "../api/pushApi";
import { pushStore } from "./pushStore";
import { toastStore } from "./toastStore";

vi.mock("../api/pushApi", () => ({
  pushApi: {
    getVapidPublicKey: vi.fn(),
    getStatus: vi.fn(),
    registerWebSubscription: vi.fn(),
    deleteWebSubscription: vi.fn(),
  },
}));

type MockPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  unsubscribe: ReturnType<typeof vi.fn>;
  toJSON: () => {
    endpoint: string;
    expirationTime: number | null;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
};

function resetPushStore() {
  pushStore.setState({
    capabilityState: "unsupported",
    permission: "unsupported",
    isSupported: false,
    isLoading: false,
    isInitialized: false,
    isServerConfigured: false,
    activeSubscriptionCount: 0,
    lastKnownEndpoint: null,
  });
}

function setUnsupportedBrowser() {
  Reflect.deleteProperty(window, "PushManager");
  Reflect.deleteProperty(window, "Notification");
  Reflect.deleteProperty(navigator, "serviceWorker");
}

function setSupportedBrowser(options?: {
  permission?: NotificationPermission;
  requestedPermission?: NotificationPermission;
  existingSubscription?: MockPushSubscription | null;
}) {
  let currentSubscription = options?.existingSubscription ?? null;
  const requestPermission = vi.fn(async () => {
    notificationMock.permission =
      options?.requestedPermission ?? options?.permission ?? "granted";
    return notificationMock.permission;
  });
  const notificationMock = {
    permission: options?.permission ?? "default",
    requestPermission,
  };
  const subscribe = vi.fn(async () => {
    currentSubscription = createSubscription(
      "https://push.example.test/subscriptions/new",
    );
    return currentSubscription;
  });
  const getSubscription = vi.fn(async () => currentSubscription);
  const getRegistration = vi.fn(async () => registration);
  const register = vi.fn(async () => registration);
  const registration = {
    pushManager: {
      getSubscription,
      subscribe,
    },
  };

  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: class PushManager {},
  });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: notificationMock,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration,
      register,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });

  return {
    notificationMock,
    registration,
    subscribe,
    getSubscription,
    getRegistration,
    register,
    getCurrentSubscription: () => currentSubscription,
  };
}

function createSubscription(endpoint: string): MockPushSubscription {
  return {
    endpoint,
    expirationTime: null,
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({
      endpoint,
      expirationTime: null,
      keys: {
        p256dh: "encoded-p256dh",
        auth: "encoded-auth",
      },
    }),
  };
}

describe("pushStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastStore.getState().clear();
    resetPushStore();
    setUnsupportedBrowser();
  });

  it("handles unsupported browsers", async () => {
    await pushStore.getState().initialize();

    expect(pushStore.getState().isSupported).toBe(false);
    expect(pushStore.getState().permission).toBe("unsupported");
    expect(pushStore.getState().capabilityState).toBe("unsupported");
  });

  it("moves to denied state when the user rejects permission", async () => {
    setSupportedBrowser({
      permission: "default",
      requestedPermission: "denied",
    });

    const enabled = await pushStore.getState().enable();

    expect(enabled).toBe(false);
    expect(pushStore.getState().permission).toBe("denied");
    expect(pushStore.getState().capabilityState).toBe("denied");
    expect(pushApi.registerWebSubscription).not.toHaveBeenCalled();
  });

  it("registers a real push subscription after permission is granted", async () => {
    const browser = setSupportedBrowser({
      permission: "default",
      requestedPermission: "granted",
    });
    vi.mocked(pushApi.getVapidPublicKey).mockResolvedValue({
      configured: true,
      publicKey: "AQID",
    });
    vi.mocked(pushApi.registerWebSubscription).mockResolvedValue({ ok: true });
    vi.mocked(pushApi.getStatus).mockResolvedValue({
      webPush: {
        configured: true,
        activeSubscriptionCount: 1,
      },
      iosPush: {
        configured: false,
        activeDeviceCount: 0,
      },
    });

    const enabled = await pushStore.getState().enable();

    expect(enabled).toBe(true);
    expect(browser.subscribe).toHaveBeenCalledTimes(1);
    expect(pushApi.registerWebSubscription).toHaveBeenCalledWith({
      endpoint: "https://push.example.test/subscriptions/new",
      expirationTime: null,
      keys: {
        p256dh: "encoded-p256dh",
        auth: "encoded-auth",
      },
      userAgent: navigator.userAgent,
    });
    expect(pushStore.getState().capabilityState).toBe("enabled");
    expect(pushStore.getState().lastKnownEndpoint).toBe(
      "https://push.example.test/subscriptions/new",
    );
  });

  it("unsubscribes and detaches the backend subscription", async () => {
    const existingSubscription = createSubscription(
      "https://push.example.test/subscriptions/existing",
    );
    setSupportedBrowser({
      permission: "granted",
      existingSubscription,
    });
    vi.mocked(pushApi.getStatus).mockResolvedValue({
      webPush: {
        configured: true,
        activeSubscriptionCount: 0,
      },
      iosPush: {
        configured: false,
        activeDeviceCount: 0,
      },
    });
    vi.mocked(pushApi.deleteWebSubscription).mockResolvedValue({ ok: true });
    pushStore.setState({
      capabilityState: "enabled",
      permission: "granted",
      isSupported: true,
      isInitialized: true,
      lastKnownEndpoint: existingSubscription.endpoint,
    });

    const disabled = await pushStore.getState().disable();

    expect(disabled).toBe(true);
    expect(pushApi.deleteWebSubscription).toHaveBeenCalledWith({
      endpoint: existingSubscription.endpoint,
    });
    expect(existingSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(pushStore.getState().capabilityState).toBe("disabled");
    expect(pushStore.getState().lastKnownEndpoint).toBeNull();
  });
});
