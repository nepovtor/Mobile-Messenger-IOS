import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/features/auth/ui/LoginForm";

const defaultProps = {
  initialPhone: "+375291234567",
  isLoading: false,
  error: null,
  status: null,
  codeSent: false,
  pendingAction: null,
  showTelegramButton: true,
  onResetFeedback: vi.fn(),
  onPhoneEdit: vi.fn(),
  onPrepareTelegram: vi.fn(async () => undefined),
  onRequestCode: vi.fn(async () => undefined),
  onVerifyCode: vi.fn(async () => undefined),
} as const;

describe("LoginForm", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps Open Telegram disabled until a pairing URL exists", () => {
    render(<LoginForm {...defaultProps} telegramStartUrl={null} />);

    expect(
      screen.getByRole("button", { name: "Открыть Telegram" }),
    ).toBeDisabled();
  });

  it("opens the saved Telegram pairing URL without opening a blank page", () => {
    const telegramStartUrl =
      "https://t.me/verificMobileMessengerIOSbot?start=pair-token";
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(<LoginForm {...defaultProps} telegramStartUrl={telegramStartUrl} />);

    fireEvent.click(screen.getByRole("button", { name: "Открыть Telegram" }));

    expect(openSpy).toHaveBeenCalledWith(
      telegramStartUrl,
      "_blank",
      "noopener,noreferrer",
    );
    expect(openSpy).not.toHaveBeenCalledWith("", expect.anything());
  });
});
