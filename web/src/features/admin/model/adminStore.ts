import { create } from "zustand";
import { adminApi } from "@/features/admin/api/adminApi";
import { ApiError, registerUnauthorizedHandler } from "@/shared/api/httpClient";
import type {
  AdminCredentials,
  CurrentAdmin,
} from "@/features/admin/types/admin";

type AdminStore = {
  currentAdmin: CurrentAdmin | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (payload: AdminCredentials) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  handleUnauthorized: (message: string) => void;
  clearError: () => void;
};

export const adminStore = create<AdminStore>((set) => ({
  currentAdmin: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  async login(payload) {
    set({ isLoading: true, error: null });
    try {
      await adminApi.login(payload);
      const currentAdmin = await adminApi.getMe();
      set({
        currentAdmin,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: mapAdminErrorMessage(error),
      });
      throw error;
    }
  },
  async logout() {
    await adminApi.logout().catch(() => undefined);
    set({
      currentAdmin: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },
  async restoreSession() {
    set({ isLoading: true, error: null });
    try {
      const currentAdmin = await adminApi.getMe();
      set({
        currentAdmin,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch {
      set({
        currentAdmin: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },
  handleUnauthorized(message) {
    set({
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
