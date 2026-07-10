import { create } from "zustand";
import { authApi } from "@/features/auth/api/authApi";
import { ApiError } from "@/shared/api/httpClient";
import { profileApi } from "@/features/profile/api/profileApi";
import type {
  AuthCodeResponse,
  AuthResponse,
  CurrentUser,
  LoginPayload,
  TelegramPairingResponse,
} from "@/features/auth/types/auth";
import { storage } from "@/utils/storage";
import { validateDisplayName } from "@/utils/displayName";

type AuthStore = {
  token: string | null;
  currentUser: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  telegramStartUrl: string | null;
  requestTelegramPairing: (phone: string) => Promise<TelegramPairingResponse>;
  requestCode: (phone: string) => Promise<AuthCodeResponse>;
  verifyCode: (phone: string, code: string) => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  handleUnauthorized: (message: string) => void;
  clearTelegramPairing: () => void;
  clearError: () => void;
};

export const authStore = create<AuthStore>((set, get) => ({
  token: storage.getToken(),
  currentUser: storage.getUser() as CurrentUser | null,
  isAuthenticated: Boolean(storage.getToken()),
  isLoading: false,
  error: null,
  telegramStartUrl: null,
  async requestTelegramPairing(phone) {
    set({ isLoading: true, error: null, telegramStartUrl: null });
    try {
      const response = await authApi.requestTelegramPairing(phone);
      set({
        isLoading: false,
        error: null,
        telegramStartUrl: response.telegramStartUrl,
      });
      return response;
    } catch (error) {
      const message = mapAuthErrorMessage(error);
      set({ isLoading: false, error: message, telegramStartUrl: null });
      throw error;
    }
  },
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
          "Sign in failed. Please check your credentials.",
        ),
        isLoading: false,
      });
      throw error;
    }
  },
  logout() {
    storage.clearAll();
    set({
      token: null,
      currentUser: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      telegramStartUrl: null,
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
      set({
        token: null,
        currentUser: null,
        isAuthenticated: false,
        isLoading: false,
        error: "Session expired. Please sign in again.",
      });
    }
  },
  async updateDisplayName(displayName) {
    const trimmed = displayName.trim();
    const validationMessage = validateDisplayName(trimmed);
    if (validationMessage) {
      throw new Error(validationMessage);
    }

    set({ isLoading: true, error: null });
    try {
      const result = await profileApi.updateProfile(trimmed);
      const existingUser = get().currentUser;
      if (!existingUser) {
        throw new Error("No authenticated user.");
      }
      const currentUser = {
        ...existingUser,
        displayName: result.displayName,
        contact: result.phone ?? existingUser.contact,
        phone: result.phone ?? existingUser.phone ?? existingUser.contact,
      };
      storage.setUser(currentUser);
      set({
        currentUser,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not update display name.";
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  handleUnauthorized(message) {
    storage.clearAll();
    set({
      token: null,
      currentUser: null,
      isAuthenticated: false,
      isLoading: false,
      error: message,
      telegramStartUrl: null,
    });
  },
  clearTelegramPairing() {
    set({ telegramStartUrl: null });
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

export function mapAuthErrorMessage(
  error: unknown,
  fallback = "Could not complete the authentication request.",
) {
  if (error instanceof ApiError && error.code === "TELEGRAM_NOT_LINKED") {
    return "Номер ещё не привязан к Telegram. Откройте Telegram и отправьте боту свой контакт.";
  }

  if (
    error instanceof ApiError &&
    (error.code === "TELEGRAM_PAIRING_UNAVAILABLE" ||
      /telegram pairing unavailable/i.test(error.backendMessage))
  ) {
    return "Telegram-вход временно не настроен на сервере.";
  }

  if (
    error instanceof ApiError &&
    (error.code === "INVALID_VERIFICATION_CODE" ||
      /(invalid|incorrect).*(code)|verification code|код.*(невер|ошиб)/i.test(
        error.backendMessage,
      ))
  ) {
    return "Неверный код.";
  }

  if (
    error instanceof ApiError &&
    (error.code === "MISSING_BEARER_TOKEN" ||
      error.code === "UNAUTHORIZED" ||
      error.status === 401 ||
      /unauthorized/i.test(error.backendMessage))
  ) {
    return "Не удалось выполнить вход. Проверьте данные и попробуйте снова.";
  }

  if (error instanceof ApiError && error.status >= 500) {
    return "Backend is unavailable right now. Please try again.";
  }

  if (
    error instanceof ApiError &&
    /(international format|valid phone number|E\.164|start with \+)/i.test(
      error.backendMessage,
    )
  ) {
    return "Введите номер в международном формате, например +375291234567.";
  }

  if (
    error instanceof Error &&
    /telegram pairing unavailable/i.test(error.message)
  ) {
    return "Telegram-вход временно не настроен на сервере.";
  }

  if (
    error instanceof Error &&
    /(invalid|incorrect).*(code)|verification code|код.*(невер|ошиб)/i.test(
      error.message,
    )
  ) {
    return "Неверный код.";
  }

  if (
    error instanceof Error &&
    /(international format|valid phone number|E\.164|start with \+)/i.test(
      error.message,
    )
  ) {
    return "Введите номер в международном формате, например +375291234567.";
  }

  if (
    error instanceof Error &&
    /(backend is unavailable|network error|timed out)/i.test(error.message)
  ) {
    return "Backend is unavailable right now. Please try again.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
