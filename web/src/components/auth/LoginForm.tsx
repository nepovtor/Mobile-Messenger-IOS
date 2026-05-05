import { useState } from "react";
import {
  BadgeCheck,
  Link2,
  MessageSquareMore,
  SendHorizonal,
} from "lucide-react";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { Input } from "../ui/Input";

type LoginFormProps = {
  initialPhone?: string;
  initialCode?: string;
  isLoading: boolean;
  error: string | null;
  codeSent: boolean;
  helperText: string | null;
  telegramHint: string;
  onLinkTelegram: (payload: { phone: string }) => Promise<void>;
  onRequestCode: (payload: { phone: string }) => Promise<void>;
  onVerifyCode: (payload: { phone: string; code: string }) => Promise<void>;
};

export function LoginForm({
  initialPhone = "",
  initialCode = "",
  isLoading,
  error,
  codeSent,
  helperText,
  telegramHint,
  onLinkTelegram,
  onRequestCode,
  onVerifyCode,
}: LoginFormProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState(initialCode);

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (code.trim()) {
          await onVerifyCode({ phone, code });
          return;
        }

        await onRequestCode({ phone });
      }}
    >
      <div className="rounded-[28px] border border-white/14 bg-white/[0.08] px-4 py-4 text-sm text-sky-50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white">
              <MessageSquareMore className="h-3.5 w-3.5" />
              Telegram
            </div>
            <div className="mt-3 leading-6 text-slate-100">{telegramHint}</div>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={isLoading || !phone.trim()}
            onClick={() => void onLinkTelegram({ phone })}
          >
            <Link2 className="h-4 w-4" />
            {isLoading ? "..." : "Открыть Telegram"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-white" htmlFor="phone">
            Номер
          </label>
          <Input
            id="phone"
            aria-label="Phone number"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+375291234567"
            className="border-white/12 bg-slate-950/72"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-white" htmlFor="code">
            Код
          </label>
          <Input
            id="code"
            aria-label="Telegram code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
            maxLength={6}
            className="border-white/12 bg-slate-950/72"
          />
        </div>
      </div>

      <div className="text-xs uppercase tracking-[0.22em] text-white/55">
        Код приходит после запроса
      </div>

      {helperText ? (
        <InlineAlert tone="info" title="Код">
          {helperText}
        </InlineAlert>
      ) : null}

      {error ? (
        <InlineAlert tone="danger" title="Ошибка">
          {error}
        </InlineAlert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          block
          disabled={isLoading || !phone.trim()}
          type="button"
          onClick={() => void onRequestCode({ phone })}
        >
          <SendHorizonal className="h-4 w-4" />
          {isLoading && !codeSent ? "Отправка..." : "Получить код"}
        </Button>
        <Button
          block
          variant={codeSent ? "primary" : "secondary"}
          disabled={isLoading || !phone.trim() || !code.trim()}
        >
          <BadgeCheck className="h-4 w-4" />
          {isLoading && codeSent ? "Проверка..." : "Войти"}
        </Button>
      </div>
    </form>
  );
}

type DemoPasswordFormProps = {
  isLoading: boolean;
  error: string | null;
  onSubmit: (payload: { contact: string; password: string }) => Promise<void>;
};

export function DemoPasswordForm({
  isLoading,
  error,
  onSubmit,
}: DemoPasswordFormProps) {
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit({ contact, password });
      }}
    >
      <div className="space-y-2">
        <label
          className="text-sm font-medium text-slate-200"
          htmlFor="demo-phone"
        >
          Demo phone
        </label>
        <Input
          id="demo-phone"
          aria-label="Demo phone"
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder="+15551230011"
        />
      </div>
      <div className="space-y-2">
        <label
          className="text-sm font-medium text-slate-200"
          htmlFor="demo-password"
        >
          Demo password
        </label>
        <Input
          id="demo-password"
          aria-label="Demo password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="demo1111"
        />
      </div>
      {error ? (
        <InlineAlert tone="danger" title="Demo sign-in error">
          {error}
        </InlineAlert>
      ) : null}
      <Button block disabled={isLoading || !contact.trim() || !password.trim()}>
        {isLoading ? "Signing in…" : "Sign in with demo account"}
      </Button>
    </form>
  );
}
