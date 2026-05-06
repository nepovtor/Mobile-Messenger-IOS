import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PushNotificationsPanel } from "./PushNotificationsPanel";
import { pushStore } from "../../store/pushStore";

function resetPushStore() {
  pushStore.setState({
    capabilityState: "unsupported",
    permission: "unsupported",
    isSupported: false,
    isLoading: false,
    isInitialized: true,
    isServerConfigured: true,
    activeSubscriptionCount: 0,
    lastKnownEndpoint: null,
    initialize: vi.fn(async () => undefined),
    syncForAuthenticatedUser: vi.fn(async () => undefined),
    detachFromCurrentSession: vi.fn(async () => undefined),
    enable: vi.fn(async () => false),
    disable: vi.fn(async () => false),
    refreshStatus: vi.fn(async () => undefined),
  });
}

describe("PushNotificationsPanel", () => {
  beforeEach(() => {
    resetPushStore();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a localized unsupported state", () => {
    render(<PushNotificationsPanel />);

    expect(screen.getByText("Не поддерживается")).toBeInTheDocument();
    expect(
      screen.getByText("В этом браузере web push недоступен."),
    ).toBeInTheDocument();
  });

  it("shows a localized denied state", () => {
    pushStore.setState({
      capabilityState: "denied",
      permission: "denied",
      isSupported: true,
    });

    render(<PushNotificationsPanel />);

    expect(screen.getByText("Нет разрешения")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Разрешение на уведомления отключено в настройках браузера.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a localized enabled state", () => {
    pushStore.setState({
      capabilityState: "enabled",
      permission: "granted",
      isSupported: true,
    });

    render(<PushNotificationsPanel />);

    expect(screen.getByText("Включены")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Новые сообщения будут приходить как реальные push-уведомления.",
      ),
    ).toBeInTheDocument();
  });
});
