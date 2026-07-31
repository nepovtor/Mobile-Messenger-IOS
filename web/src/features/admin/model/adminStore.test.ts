import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "@/features/admin/api/adminApi";
import { adminStore } from "@/features/admin/model/adminStore";

vi.mock("@/features/admin/api/adminApi", () => ({
  adminApi: {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
}));

describe("adminStore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    adminStore.setState({
      currentAdmin: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it("loads the admin profile from the cookie session after login", async () => {
    vi.mocked(adminApi.login).mockResolvedValue({
      admin: {
        login: "operator",
        role: "admin",
        displayName: "Operator",
      },
      expiresIn: "15m",
    });
    vi.mocked(adminApi.getMe).mockResolvedValue({
      login: "operator",
      role: "admin",
      displayName: "Operator",
    });

    await adminStore.getState().login({
      login: "operator",
      password: "secret",
    });

    expect(adminApi.login).toHaveBeenCalledTimes(1);
    expect(adminApi.getMe).toHaveBeenCalledTimes(1);
    expect(adminStore.getState().isAuthenticated).toBe(true);
    expect(adminStore.getState()).not.toHaveProperty("token");
  });

  it("restores the admin session through /me", async () => {
    vi.mocked(adminApi.getMe).mockResolvedValue({
      login: "operator",
      role: "admin",
      displayName: "Operator",
    });

    await adminStore.getState().restoreSession();

    expect(adminApi.getMe).toHaveBeenCalledTimes(1);
    expect(adminStore.getState().currentAdmin?.login).toBe("operator");
    expect(adminStore.getState().isAuthenticated).toBe(true);
  });

  it("calls server logout and clears memory even when logout fails", async () => {
    adminStore.setState({
      currentAdmin: {
        login: "operator",
        role: "admin",
        displayName: "Operator",
      },
      isAuthenticated: true,
    });
    vi.mocked(adminApi.logout).mockRejectedValue(new Error("offline"));

    await adminStore.getState().logout();

    expect(adminApi.logout).toHaveBeenCalledTimes(1);
    expect(adminStore.getState().currentAdmin).toBeNull();
    expect(adminStore.getState().isAuthenticated).toBe(false);
  });
});
