import { create } from "zustand";
import { authApi } from "../api/authApi";
import { ApiError } from "../api/httpClient";
import type {
  AuthCodeResponse,
  AuthResponse,
  CurrentUser,
  LoginPayload,
} from "../types/auth";
import { storage } from "../utils/storage";
import { chatStore } from "./chatStore";
import { realtimeStore } from "./realtimeStore";

type AuthStore = {
  token: string | null;
  currentUser: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  requestCode: (phone: string) => Promise<AuthCodeResponse>;
  verifyCode: (phone: string, code: string) => Promise<void>;
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
  async requestCode(phone) {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.requestCode(phone);
      set({ isLoading: false, error: null });
      return response;
    } catch (error) {
      const message = mapAuthErrorMessage(error);
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  async verifyCode(phone, code) {
    set({ isLoading: true, error: null });
    try {
      const result = await authApi.verifyCode(phone, code);
      await authenticateWithBackendResult(result, set);
    } catch (error) {
      const message = mapAuthErrorMessage(error);
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  async login(payload) {
    set({ isLoading: true, error: null });
    try {
      const result = await authApi.login(payload);
      await authenticateWithBackendResult(result, set);
    } catch (error) {
      set({
        error: mapAuthErrorMessage(
          error,
          "Sign in failed. Please check your demo credentials.",
        ),
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

async function authenticateWithBackendResult(
  result: AuthResponse,
  set: (partial: Partial<AuthStore>) => void,
) {
  storage.setToken(result.token);
  set({
    token: result.token,
    isAuthenticated: true,
  });
  const currentUser = await authApi.getMe();
  storage.setUser(currentUser);
  set({
    token: result.token,
    currentUser,
    isAuthenticated: true,
    isLoading: false,
    error: null,
  });
}

function mapAuthErrorMessage(
  error: unknown,
  fallback = "Could not complete the authentication request.",
) {
  if (error instanceof ApiError && error.code === "TELEGRAM_NOT_LINKED") {
    return "Open the Telegram bot, press /start, send your phone number there, and then request the code again.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
