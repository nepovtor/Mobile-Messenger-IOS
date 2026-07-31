import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi } from "@/features/auth/api/authApi";
import { ApiError } from "@/shared/api/httpClient";
import { profileApi } from "@/features/profile/api/profileApi";
import { pushStore } from "@/features/push/model/pushStore";
import {
  authStore,
  mapAuthErrorMessage,
} from "@/features/auth/model/authStore";
import { chatStore } from "@/features/chat/model/chatStore";
import { realtimeStore } from "@/features/chat/model/realtimeStore";
import { logoutUserSession } from "@/app/sessionCoordinator";

vi.mock("@/features/auth/api/authApi", () => ({
  authApi: {
    requestTelegramPairing: vi.fn(),
    requestCode: vi.fn(),
    verifyCode: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
}));

vi.mock("@/features/profile/api/profileApi", () => ({
  profileApi: {
    updateProfile: vi.fn(),
  },
}));

describe("authStore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.logout).mockResolvedValue();
    authStore.setState({
      currentUser: {
        userID: "user-1",
        displayName: "Anna",
        contact: "+1555",
        method: "phone",
      },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      telegramStartUrl: null,
    });
    chatStore.setState({
      chats: [
        {
          id: "chat-1",
          title: "General",
          lastMessagePreview: null,
          lastActivity: new Date().toISOString(),
          unreadCount: 0,
          typingParticipants: [],
          participantNames: [],
          participantCount: 2,
        },
      ],
      messagesByChatId: {
        "chat-1": [],
      },
      selectedChatId: "chat-1",
      isLoadingChats: false,
      isLoadingMessages: false,
      error: null,
    });
  });

  it("session coordinator clears auth, chat, and realtime state", async () => {
    const clearSpy = vi.spyOn(realtimeStore.getState(), "clear");
    const detachSpy = vi
      .spyOn(pushStore.getState(), "detachFromCurrentSession")
      .mockResolvedValue();

    try {
      await logoutUserSession();

      expect(authStore.getState().currentUser).toBeNull();
      expect(authStore.getState()).not.toHaveProperty("token");
      expect(chatStore.getState().chats).toHaveLength(0);
      expect(chatStore.getState().selectedChatId).toBeNull();
      expect(clearSpy).toHaveBeenCalled();
      expect(detachSpy).toHaveBeenCalledTimes(1);
      expect(authApi.logout).toHaveBeenCalledTimes(1);
    } finally {
      clearSpy.mockRestore();
      detachSpy.mockRestore();
    }
  });

  it("establishes a cookie session before requesting the current user", async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      userID: "user-2",
      displayName: "Boris",
      phone: "+15550002",
    });
    vi.mocked(authApi.getMe).mockImplementation(async () => {
      expect(authApi.login).toHaveBeenCalledTimes(1);

      return {
        userID: "user-2",
        displayName: "Boris",
        contact: "+15550002",
        method: "phone",
      };
    });

    await authStore.getState().login({
      method: "phone",
      contact: "+15550002",
      password: "pass2222",
    });

    expect(authStore.getState().currentUser?.displayName).toBe("Boris");
    expect(authStore.getState()).not.toHaveProperty("token");
  });

  it("verifyCode restores the cookie session current user", async () => {
    vi.mocked(authApi.verifyCode).mockResolvedValue({
      userID: "user-3",
      displayName: "Vera",
      phone: "+15550003",
    });
    vi.mocked(authApi.getMe).mockResolvedValue({
      userID: "user-3",
      displayName: "Vera",
      contact: "+15550003",
      phone: "+15550003",
      method: "phone",
    });

    await authStore.getState().verifyCode("+15550003", "123456");

    expect(authStore.getState().currentUser?.contact).toBe("+15550003");
  });

  it("restores a session by requesting /me without local state", async () => {
    authStore.setState({
      currentUser: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    vi.mocked(authApi.getMe).mockResolvedValue({
      userID: "user-4",
      displayName: "Nina",
      contact: "+15550004",
      method: "phone",
    });

    await authStore.getState().restoreSession();

    expect(authApi.getMe).toHaveBeenCalledTimes(1);
    expect(authStore.getState().isAuthenticated).toBe(true);
    expect(authStore.getState().currentUser?.userID).toBe("user-4");
  });

  it("requestCode returns backend cooldown payload", async () => {
    vi.mocked(authApi.requestCode).mockResolvedValue({
      status: "code_sent",
      delivery: "telegram",
      resendAfterSeconds: 60,
      expiresIn: 300,
      debugCode: undefined,
    });

    const response = await authStore.getState().requestCode("+15550004");

    expect(response.status).toBe("code_sent");
    expect(response.resendAfterSeconds).toBe(60);
  });

  it("requestTelegramPairing stores the pairing payload", async () => {
    vi.mocked(authApi.requestTelegramPairing).mockResolvedValue({
      botUsername: "mobile_auth_bot",
      telegramStartUrl: "https://t.me/mobile_auth_bot?start=secure-pair-token",
      expiresIn: 600,
    });

    const response = await authStore
      .getState()
      .requestTelegramPairing("+15550004");

    expect(response.telegramStartUrl).toContain("secure-pair-token");
    expect(response.expiresIn).toBe(600);
    expect(authStore.getState().telegramStartUrl).toBe(
      "https://t.me/mobile_auth_bot?start=secure-pair-token",
    );
  });

  it("maps TELEGRAM_NOT_LINKED into a user-friendly auth error", async () => {
    vi.mocked(authApi.requestCode).mockRejectedValue(
      new ApiError(
        "Link Telegram in the app first and send your own contact to the bot before requesting a code.",
        400,
        "TELEGRAM_NOT_LINKED",
      ),
    );

    await expect(
      authStore.getState().requestCode("+15550005"),
    ).rejects.toBeDefined();

    expect(authStore.getState().error).toBe(
      "Номер ещё не привязан к Telegram. Откройте Telegram и отправьте боту свой контакт.",
    );
  });

  it("maps Telegram pairing misconfiguration into a dedicated auth error", () => {
    expect(
      mapAuthErrorMessage(new ApiError("Telegram pairing unavailable", 503)),
    ).toBe("Telegram-вход временно не настроен на сервере.");
  });

  it("stores the dedicated Telegram error when pairing returns 503", async () => {
    vi.mocked(authApi.requestTelegramPairing).mockRejectedValue(
      new ApiError("Telegram pairing unavailable", 503),
    );

    await expect(
      authStore.getState().requestTelegramPairing("+15550006"),
    ).rejects.toBeDefined();

    expect(authStore.getState().telegramStartUrl).toBeNull();
    expect(authStore.getState().error).toBe(
      "Telegram-вход временно не настроен на сервере.",
    );
  });

  it("maps invalid verification codes into a short auth error", () => {
    expect(
      mapAuthErrorMessage(
        new ApiError("Verification failed", 401, "INVALID_VERIFICATION_CODE"),
      ),
    ).toBe("Неверный код.");
  });

  it("maps network errors into backend-unavailable copy", () => {
    expect(
      mapAuthErrorMessage(
        new ApiError("Network error. Please check your connection.", 0),
      ),
    ).toBe("Backend is unavailable right now. Please try again.");
  });

  it("maps missing bearer tokens into an authentication error", () => {
    expect(
      mapAuthErrorMessage(
        new ApiError("Unauthorized", 401, "MISSING_BEARER_TOKEN"),
      ),
    ).toBe("Не удалось выполнить вход. Проверьте данные и попробуйте снова.");
  });

  it("maps generic 5xx auth failures into backend-unavailable copy", () => {
    expect(
      mapAuthErrorMessage(new ApiError("Internal server error", 503)),
    ).toBe("Backend is unavailable right now. Please try again.");
  });

  it("maps invalid phone errors into an international-format hint", () => {
    expect(
      mapAuthErrorMessage(
        new ApiError(
          "Phone number must be in international format and start with +",
          400,
        ),
      ),
    ).toBe("Введите номер в международном формате, например +375291234567.");
  });

  it("updateDisplayName refreshes currentUser without clearing the session", async () => {
    vi.mocked(profileApi.updateProfile).mockResolvedValue({
      userID: "user-1",
      displayName: "Anna Updated",
      phone: "+1555",
    });

    await authStore.getState().updateDisplayName("Anna Updated");

    expect(authStore.getState().currentUser?.displayName).toBe("Anna Updated");
    expect(authStore.getState().isAuthenticated).toBe(true);
  });
});
