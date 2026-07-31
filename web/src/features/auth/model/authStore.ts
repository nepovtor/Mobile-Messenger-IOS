import { create } from "zustand";
import { authApi } from "@/features/auth/api/authApi";
import { ApiError } from "@/shared/api/httpClient";
import { profileApi } from "@/features/profile/api/profileApi";
import type {
  AuthCodeResponse,
  CurrentUser,
  LoginPayload,
  TelegramPairingResponse,
} from "@/features/auth/types/auth";
import { validateDisplayName } from "@/utils/displayName";

type AuthStore = {
  currentUser: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  telegramStartUrl: string | null;
  requestTelegramPairing: (phone: string) => Promise<TelegramPairingResponse>;
  requestCode: (phone: string) => Promise<AuthCodeResponse>;
  verifyCode: (phone: string, code: string) => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  handleUnauthorized: (message: string) => void;
  clearTelegramPairing: () => void;
  clearError: () => void;
};

export const authStore = create<AuthStore>((set, get) => ({
  currentUser: null,
  isAuthenticated: false,
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
      await authApi.verifyCode(phone, code);
      await authenticateWithSessionCookie(set);
    } catch (error) {
      const message = mapAuthErrorMessage(error);
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  async login(payload) {
    set({ isLoading: true, error: null });
    try {
      await authApi.login(payload);
      await authenticateWithSessionCookie(set);
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
  async logout() {
    await authApi.logout().catch(() => undefined);
    set({
      currentUser: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      telegramStartUrl: null,
    });
  },
  async restoreSession() {
    set({ isLoading: true, error: null });
    try {
      const currentUser = await authApi.getMe();
      set({
        currentUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch {
      set({
        currentUser: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
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
    set({
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

async function authenticateWithSessionCookie(
  set: (partial: Partial<AuthStore>) => void,
) {
  set({
    currentUser: null,
    isAuthenticated: false,
  });
  try {
    const currentUser = await authApi.getMe();
    set({
      currentUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  } catch (error) {
    set({
      currentUser: null,
      isAuthenticated: false,
      isLoading: false,
    });
    throw error;
  }
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
