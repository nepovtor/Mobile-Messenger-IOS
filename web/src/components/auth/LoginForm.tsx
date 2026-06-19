import { useState } from "react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { Input } from "../ui/Input";

type AuthMode = "login" | "register";

type LoginFormProps = {
  initialPhone?: string;
  initialCode?: string;
  isLoading: boolean;
  error: string | null;
  status: string | null;
  codeSent: boolean;
  pendingAction: "pairing" | "code" | "verify" | null;
  telegramStartUrl: string | null;
  showTelegramButton?: boolean;
  onResetFeedback: () => void;
  onPhoneEdit: () => void;
  onPrepareTelegram: (payload: { phone: string }) => Promise<void>;
  onRequestCode: (payload: { phone: string }) => Promise<void>;
  onVerifyCode: (payload: { phone: string; code: string }) => Promise<void>;
};

const authModes = [
  { value: "login", label: "Вход" },
  { value: "register", label: "Регистрация" },
] as const satisfies ReadonlyArray<{ value: AuthMode; label: string }>;

export function LoginForm({
  initialPhone = "",
  initialCode = "",
  isLoading,
  error,
  status,
  codeSent,
  pendingAction,
  telegramStartUrl,
  showTelegramButton = false,
  onResetFeedback,
  onPhoneEdit,
  onPrepareTelegram,
  onRequestCode,
  onVerifyCode,
}: LoginFormProps) {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState(initialCode);

  const submitLabel = authMode === "login" ? "Войти" : "Создать аккаунт";

  const resetFeedback = () => {
    if (error || status) {
      onResetFeedback();
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!phone.trim() || !code.trim()) {
          return;
        }

        try {
          await onVerifyCode({ phone, code });
        } catch {
          return undefined;
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2 rounded-[24px] border border-white/8 bg-black/20 p-1">
        {authModes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            aria-pressed={authMode === mode.value}
            className={clsx(
              "rounded-[18px] px-4 py-3 text-sm font-medium transition",
              authMode === mode.value
                ? "bg-white/[0.1] text-white shadow-[0_12px_30px_rgba(5,12,24,0.28)]"
                : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100",
            )}
            onClick={() => {
              setAuthMode(mode.value);
              resetFeedback();
            }}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-100" htmlFor="phone">
            Телефон
          </label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            aria-label="Телефон"
            value={phone}
            onChange={(event) => {
              const nextPhone = event.target.value;
              setPhone(nextPhone);
              if (code) {
                setCode("");
              }
              onPhoneEdit();
            }}
            onBlur={() => {
              if (phone.trim() && !telegramStartUrl) {
                void onPrepareTelegram({ phone }).catch(() => undefined);
              }
            }}
            placeholder="+375291234567"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-100" htmlFor="code">
            Код
          </label>
          <Input
            id="code"
            autoComplete="one-time-code"
            inputMode="numeric"
            aria-label="Код"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              resetFeedback();
            }}
            placeholder="123456"
            maxLength={6}
          />
        </div>
      </div>

      {status && !error ? (
        <InlineAlert className="rounded-[22px] px-3.5 py-3" tone="info">
          {status}
        </InlineAlert>
      ) : null}

      {error ? (
        <InlineAlert className="rounded-[22px] px-3.5 py-3" tone="danger">
          {error}
        </InlineAlert>
      ) : null}

      {showTelegramButton ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            isLoading={pendingAction === "pairing"}
            disabled={isLoading || !telegramStartUrl}
            className="rounded-[18px] px-0 text-cyan-100 hover:bg-transparent hover:text-cyan-50"
            onClick={() => {
              if (telegramStartUrl) {
                window.open(
                  telegramStartUrl,
                  "_blank",
                  "noopener,noreferrer",
                );
              }
            }}
          >
            Открыть Telegram
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          block
          type="button"
          variant="secondary"
          isLoading={pendingAction === "code"}
          disabled={isLoading || !phone.trim() || !telegramStartUrl}
          onClick={() => {
            void onRequestCode({ phone }).catch(() => undefined);
          }}
        >
          Получить код
        </Button>
        <Button
          block
          type="submit"
          isLoading={pendingAction === "verify"}
          variant={codeSent ? "primary" : "secondary"}
          disabled={isLoading || !phone.trim() || !code.trim()}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
