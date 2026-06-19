import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/httpClient";
import { LoginPage } from "./LoginPage";

const {
  authStoreMock,
  requestCodeMock,
  requestTelegramPairingMock,
  verifyCodeMock,
  clearErrorMock,
} = vi.hoisted(() => ({
  authStoreMock: vi.fn(),
  requestCodeMock: vi.fn(),
  requestTelegramPairingMock: vi.fn(),
  verifyCodeMock: vi.fn(),
  clearErrorMock: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    header: ({ children, ...props }: ComponentProps<"header">) => (
      <header {...props}>{children}</header>
    ),
    div: ({ children, ...props }: ComponentProps<"div">) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("../store/authStore", () => ({
  authStore: authStoreMock,
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-creates Telegram pairing and reuses the saved start URL", async () => {
    const telegramStartUrl =
      "https://t.me/verificMobileMessengerIOSbot?start=pair-token";
    const replaceSpy = vi.fn();
    const closeSpy = vi.fn();

    authStoreMock.mockReturnValue({
      requestTelegramPairing: requestTelegramPairingMock,
      requestCode: requestCodeMock,
      verifyCode: verifyCodeMock,
      isLoading: false,
      error: null,
      clearError: clearErrorMock,
    });

    requestCodeMock.mockRejectedValue(
      new ApiError(
        "Link Telegram in the app first and send your own contact to the bot before requesting a code.",
        400,
        "TELEGRAM_NOT_LINKED",
      ),
    );
    requestTelegramPairingMock.mockResolvedValue({
      botUsername: "verificMobileMessengerIOSbot",
      telegramStartUrl,
      expiresIn: 600,
    });

    vi.spyOn(window, "open").mockReturnValue({
      opener: null,
      location: {
        replace: replaceSpy,
      },
      close: closeSpy,
    } as unknown as Window);

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Телефон"), {
      target: { value: "+375291234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Получить код" }));

    expect(requestCodeMock).toHaveBeenCalledWith("+375291234567");

    await screen.findByText(
      "Номер ещё не привязан к Telegram. Нажмите «Открыть Telegram» и отправьте боту свой контакт.",
    );

    expect(requestTelegramPairingMock).toHaveBeenCalledTimes(1);
    expect(requestTelegramPairingMock).toHaveBeenCalledWith("+375291234567");

    fireEvent.click(screen.getByRole("button", { name: "Открыть Telegram" }));

    await waitFor(() => {
      expect(requestTelegramPairingMock).toHaveBeenCalledTimes(1);
      expect(replaceSpy).toHaveBeenCalledWith(telegramStartUrl);
    });
  });
});
