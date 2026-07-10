import { create } from "zustand";
import { adminApi } from "@/features/admin/api/adminApi";
import { ApiError, registerUnauthorizedHandler } from "@/shared/api/httpClient";
import type {
  AdminAuthResponse,
  AdminCredentials,
  CurrentAdmin,
} from "@/features/admin/types/admin";
import { adminStorage } from "@/utils/storage";

type AdminStore = {
  token: string | null;
  currentAdmin: CurrentAdmin | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (payload: AdminCredentials) => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<void>;
  handleUnauthorized: (message: string) => void;
  clearError: () => void;
};

export const adminStore = create<AdminStore>((set) => ({
  token: adminStorage.getToken(),
  currentAdmin: adminStorage.getUser() as CurrentAdmin | null,
  isAuthenticated: Boolean(adminStorage.getToken()),
  isLoading: false,
  error: null,
  async login(payload) {
    set({ isLoading: true, error: null });
    try {
      const result = await adminApi.login(payload);
      persistAdminSession(result, set);
    } catch (error) {
      set({
        isLoading: false,
        error: mapAdminErrorMessage(error),
      });
      throw error;
    }
  },
  logout() {
    adminStorage.clearAll();
    set({
      token: null,
      currentAdmin: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },
  async restoreSession() {
    const token = adminStorage.getToken();
    if (!token) {
      set({ token: null, currentAdmin: null, isAuthenticated: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const currentAdmin = await adminApi.getMe();
      adminStorage.setUser(currentAdmin);
      set({
        token,
        currentAdmin,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch {
      adminStorage.clearAll();
      set({
        token: null,
        currentAdmin: null,
        isAuthenticated: false,
        isLoading: false,
        error: "Admin session expired. Please sign in again.",
      });
    }
  },
  handleUnauthorized(message) {
    adminStorage.clearAll();
    set({
      token: null,
      currentAdmin: null,
      isAuthenticated: false,
      isLoading: false,
      error: message,
    });
  },
  clearError() {
    set({ error: null });
  },
}));

registerUnauthorizedHandler("admin", (message) => {
  adminStore.getState().handleUnauthorized(message);
});

function persistAdminSession(
  result: AdminAuthResponse,
  set: (partial: Partial<AdminStore>) => void,
) {
  adminStorage.setToken(result.token);
  adminStorage.setUser(result.admin);
  set({
    token: result.token,
    currentAdmin: result.admin,
    isAuthenticated: true,
    isLoading: false,
    error: null,
  });
}

function mapAdminErrorMessage(
  error: unknown,
  fallback = "Could not sign in to the admin console.",
) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
