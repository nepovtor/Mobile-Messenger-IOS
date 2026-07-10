import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "@/features/auth/ui/LoginPage";

const {
  authStoreMock,
  requestCodeMock,
  requestTelegramPairingMock,
  verifyCodeMock,
  clearTelegramPairingMock,
  clearErrorMock,
} = vi.hoisted(() => ({
  authStoreMock: vi.fn(),
  requestCodeMock: vi.fn(),
  requestTelegramPairingMock: vi.fn(),
  verifyCodeMock: vi.fn(),
  clearTelegramPairingMock: vi.fn(),
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

vi.mock("@/features/auth/model/authStore", () => ({
  authStore: authStoreMock,
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prepares Telegram pairing after the phone field is completed", async () => {
    authStoreMock.mockReturnValue({
      requestTelegramPairing: requestTelegramPairingMock,
      requestCode: requestCodeMock,
      verifyCode: verifyCodeMock,
      isLoading: false,
      error: null,
      telegramStartUrl: null,
      clearTelegramPairing: clearTelegramPairingMock,
      clearError: clearErrorMock,
    });

    requestTelegramPairingMock.mockResolvedValue({
      botUsername: "verificMobileMessengerIOSbot",
      telegramStartUrl:
        "https://t.me/verificMobileMessengerIOSbot?start=pair-token",
      expiresIn: 600,
    });

    render(<LoginPage />);

    const phoneInput = screen.getByLabelText("Телефон");
    fireEvent.change(phoneInput, {
      target: { value: "+375291234567" },
    });
    fireEvent.blur(phoneInput);

    await waitFor(() => {
      expect(requestTelegramPairingMock).toHaveBeenCalledTimes(1);
      expect(requestTelegramPairingMock).toHaveBeenCalledWith("+375291234567");
    });
    expect(requestCodeMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "Нажмите «Открыть Telegram» и отправьте боту свой контакт.",
      ),
    ).toBeInTheDocument();
  });
});
