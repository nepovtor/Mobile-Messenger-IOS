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
import {
  clearLegacyAccessToken,
  setLegacyAccessToken,
} from "@/shared/auth/legacySession";

let authGeneration = 0;
let logoutOperation: Promise<void> | undefined;
const logoutReceiptKey = "mobile-messenger.logout-pending.v1";

function hasPendingLogout(): boolean {
  try {
    return (
      localStorage.getItem(logoutReceiptKey)?.startsWith("pending") === true
    );
  } catch {
    return false;
  }
}

type AuthStore = {
  logoutPending: boolean;
  logoutError: string | null;
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
  observeLogoutReceipt: (marker: string | null) => void;
  restoreSession: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  handleUnauthorized: (message: string) => void;
  clearTelegramPairing: () => void;
  clearError: () => void;
};

export const authStore = create<AuthStore>((set, get) => ({
  logoutPending: hasPendingLogout(),
  logoutError: null,
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
    if (get().logoutPending)
      throw new Error("Сначала завершите выход из предыдущей сессии");
    const current = authGeneration;
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.verifyCode(phone, code);
      if (current !== authGeneration) return;
      setLegacyAccessToken(response.token);
      await authenticateWithSessionCookie(set, current);
    } catch (error) {
      if (current !== authGeneration) return;
      clearLegacyAccessToken();
      const message = mapAuthErrorMessage(error);
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  async login(payload) {
    if (get().logoutPending)
      throw new Error("Сначала завершите выход из предыдущей сессии");
    const current = authGeneration;
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(payload);
      if (current !== authGeneration) return;
      setLegacyAccessToken(response.token);
      await authenticateWithSessionCookie(set, current);
    } catch (error) {
      if (current !== authGeneration) return;
      clearLegacyAccessToken();
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
    if (logoutOperation) return logoutOperation;
    ++authGeneration;
    const operation = (async () => {
      set({ logoutPending: true, logoutError: null });
      let pendingUserID = get().currentUser?.userID;
      try {
        pendingUserID ??= localStorage.getItem(logoutReceiptKey)?.split(":")[1];
      } catch {
        /* No persistent storage. */
      }
      // Only a receipt marker is persisted. The HttpOnly refresh cookie remains
      // available to the idempotent logout endpoint until remote acknowledgement.
      try {
        localStorage.setItem(
          logoutReceiptKey,
          pendingUserID ? `pending:${pendingUserID}` : "pending",
        );
      } catch {
        /* Still try to settle online. */
      }
      let acknowledged = false;
      try {
        await authApi.logout();
        acknowledged = true;
        if (pendingUserID) {
          const { retireSealedSessions } =
            await import("@/features/chat/matrix/sessionVault");
          await retireSealedSessions(pendingUserID);
        }
      } catch (error) {
        set({
          logoutError: acknowledged
            ? "Сессия отозвана. Не удалось закрыть локальные учётные данные. Повторите выход."
            : "Сервер не подтвердил отзыв сессии. Проверьте соединение и повторите выход.",
        });
        throw error;
      }
      try {
        localStorage.removeItem(logoutReceiptKey);
      } catch {
        /* A harmless retry after reload is safe. */
      }
      clearLegacyAccessToken();
      set({
        logoutPending: false,
        logoutError: null,
        currentUser: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        telegramStartUrl: null,
      });
    })();
    logoutOperation = operation;
    try {
      await operation;
    } finally {
      if (logoutOperation === operation) logoutOperation = undefined;
    }
  },
  observeLogoutReceipt(marker) {
    ++authGeneration;
    if (marker?.startsWith("pending")) {
      set({ logoutPending: true, logoutError: null });
    } else {
      clearLegacyAccessToken();
      set({
        logoutPending: false,
        logoutError: null,
        currentUser: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        telegramStartUrl: null,
      });
    }
  },
  async restoreSession() {
    if (get().logoutPending || hasPendingLogout()) {
      set({ logoutPending: true, isLoading: false });
      return;
    }
    const current = authGeneration;
    set({ isLoading: true, error: null });
    try {
      const currentUser = await authApi.getMe();
      if (current !== authGeneration) return;
      set({
        currentUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch {
      if (current !== authGeneration) return;
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
    if (get().logoutPending) return;
    ++authGeneration;
    clearLegacyAccessToken();
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
  current: number,
) {
  set({
    currentUser: null,
    isAuthenticated: false,
  });
  try {
    const currentUser = await authApi.getMe();
    if (current !== authGeneration) return;
    set({
      currentUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  } catch (error) {
    if (current !== authGeneration) return;
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
    /verification code expired/i.test(error.backendMessage)
  ) {
    return "Срок действия кода истёк. Получите новый код.";
  }

  if (
    error instanceof ApiError &&
    /verification code has already been used/i.test(error.backendMessage)
  ) {
    return "Код уже использован. Получите новый код.";
  }

  if (
    error instanceof ApiError &&
    /too many verification attempts/i.test(error.backendMessage)
  ) {
    return "Слишком много попыток. Получите новый код.";
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
