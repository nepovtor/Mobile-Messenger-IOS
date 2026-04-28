import { create } from "zustand";
import { authApi } from "../api/authApi";
import type { CurrentUser, LoginPayload } from "../types/auth";
import { storage } from "../utils/storage";
import { chatStore } from "./chatStore";
import { realtimeStore } from "./realtimeStore";

type AuthStore = {
  token: string | null;
  currentUser: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<void>;
  handleUnauthorized: (message: string) => void;
  clearError: () => void;
};

export const authStore = create<AuthStore>((set) => ({
  token: storage.getToken(),
  currentUser: storage.getUser() as CurrentUser | null,
  isAuthenticated: Boolean(storage.getToken()),
  isLoading: false,
  error: null,
  async login(payload) {
    set({ isLoading: true, error: null });
    try {
      const result = await authApi.login(payload);
      storage.setToken(result.token);
      const currentUser = await authApi.getMe();
      storage.setUser(currentUser);
      set({
        token: result.token,
        currentUser,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Sign in failed. Please check your demo credentials.",
        isLoading: false,
      });
      throw error;
    }
  },
  logout() {
    storage.clearAll();
    realtimeStore.getState().clear();
    chatStore.getState().clear();
    set({
      token: null,
      currentUser: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },
  async restoreSession() {
    const token = storage.getToken();
    if (!token) {
      set({ isAuthenticated: false, currentUser: null });
      return;
    }

    set({ isLoading: true });
    try {
      const currentUser = await authApi.getMe();
      storage.setUser(currentUser);
      set({
        token,
        currentUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch {
      storage.clearAll();
      chatStore.getState().clear();
      realtimeStore.getState().clear();
      set({
        token: null,
        currentUser: null,
        isAuthenticated: false,
        isLoading: false,
        error: "Session expired. Please sign in again.",
      });
    }
  },
  handleUnauthorized(message) {
    storage.clearAll();
    chatStore.getState().clear();
    realtimeStore.getState().clear();
    set({
      token: null,
      currentUser: null,
      isAuthenticated: false,
      isLoading: false,
      error: message,
    });
  },
  clearError() {
    set({ error: null });
  },
}));
