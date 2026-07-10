import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "@/App";

const {
  restoreSession,
  restoreAdminSession,
  initializePush,
  syncPushForUser,
  detachPushFromSession,
  clearLocation,
  authStoreMock,
  adminStoreMock,
} = vi.hoisted(() => ({
  restoreSession: vi.fn(async () => undefined),
  restoreAdminSession: vi.fn(async () => undefined),
  initializePush: vi.fn(async () => undefined),
  syncPushForUser: vi.fn(async () => undefined),
  detachPushFromSession: vi.fn(async () => undefined),
  clearLocation: vi.fn(),
  authStoreMock: Object.assign(vi.fn(), {
    getState: vi.fn(),
  }),
  adminStoreMock: vi.fn(),
}));

vi.mock("@/features/admin/ui/AdminLoginPage", () => ({
  AdminLoginPage: () => <div>admin-login</div>,
}));

vi.mock("@/features/auth/ui/LoginPage", () => ({
  LoginPage: () => <div>login</div>,
}));

vi.mock("@/features/location/ui/MapPage", () => ({
  MapPage: () => <div>map</div>,
}));

vi.mock("@/features/chat/ui/MessengerPage", () => ({
  MessengerPage: () => <div>messenger</div>,
}));

vi.mock("@/features/admin/ui/SystemPage", () => ({
  SystemPage: () => <div>system</div>,
}));

vi.mock("@/features/auth/ui/TelegramSubscriptionPage", () => ({
  TelegramSubscriptionPage: () => <div>telegram-subscription</div>,
}));

vi.mock("@/features/auth/model/authStore", () => ({
  authStore: authStoreMock,
}));

vi.mock("@/features/admin/model/adminStore", () => ({
  adminStore: adminStoreMock,
}));

vi.mock("@/features/location/model/locationStore", () => ({
  locationStore: {
    getState: () => ({
      clear: clearLocation,
    }),
  },
}));

vi.mock("@/features/push/model/pushStore", () => ({
  pushStore: {
    getState: () => ({
      initialize: initializePush,
      syncForAuthenticatedUser: syncPushForUser,
      detachFromCurrentSession: detachPushFromSession,
    }),
  },
}));

describe("App push session handling", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    authStoreMock.mockReturnValue({
      restoreSession,
      isAuthenticated: false,
      isLoading: true,
    });
    authStoreMock.getState.mockReturnValue({
      isAuthenticated: false,
    });
    adminStoreMock.mockReturnValue({
      restoreSession: restoreAdminSession,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("does not detach the web push subscription while the user session is restoring", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(restoreSession).toHaveBeenCalledTimes(1);
      expect(restoreAdminSession).toHaveBeenCalledTimes(1);
      expect(initializePush).toHaveBeenCalledTimes(1);
    });

    expect(detachPushFromSession).not.toHaveBeenCalled();
    expect(syncPushForUser).not.toHaveBeenCalled();
  });
});
