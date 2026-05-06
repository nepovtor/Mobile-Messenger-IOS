import { useState } from "react";
import {
  BadgeCheck,
  Link2,
  MessageSquareMore,
  SendHorizonal,
  ShieldCheck,
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
      className="space-y-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (code.trim()) {
          await onVerifyCode({ phone, code });
          return;
        }

        await onRequestCode({ phone });
      }}
    >
      <div className="rounded-[30px] border border-white/12 bg-white/[0.05] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-xl">
            <div className="app-kicker">
              <MessageSquareMore className="h-3.5 w-3.5" />
              Telegram verification
            </div>
            <div className="mt-4 text-sm leading-7 text-slate-200">
              {telegramHint}
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={isLoading || !phone.trim()}
            onClick={() => void onLinkTelegram({ phone })}
          >
            <Link2 className="h-4 w-4" />
            Открыть Telegram
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-white" htmlFor="phone">
            Телефон
          </label>
          <Input
            id="phone"
            aria-label="Phone number"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+375291234567"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-white" htmlFor="code">
            Одноразовый код
          </label>
          <Input
            id="code"
            aria-label="Telegram code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
            maxLength={6}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4">
          <div className="app-kicker">
            <Link2 className="h-3.5 w-3.5" />
            Step 1
          </div>
          <p className="mt-3 text-sm font-semibold text-white">
            Свяжите Telegram
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Откройте бота и подтвердите свой номер через контакт.
          </p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4">
          <div className="app-kicker">
            <SendHorizonal className="h-3.5 w-3.5" />
            Step 2
          </div>
          <p className="mt-3 text-sm font-semibold text-white">Запросите код</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Код придёт через выбранный серверный провайдер авторизации.
          </p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4">
          <div className="app-kicker">
            <ShieldCheck className="h-3.5 w-3.5" />
            Step 3
          </div>
          <p className="mt-3 text-sm font-semibold text-white">
            Подтвердите вход
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            После проверки код создаст сессию и откроет рабочее пространство.
          </p>
        </div>
      </div>

      {helperText ? (
        <InlineAlert tone="info" title="Статус проверки">
          {helperText}
        </InlineAlert>
      ) : null}

      {error ? (
        <InlineAlert tone="danger" title="Не удалось выполнить вход">
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
          {isLoading && !codeSent ? "Запрашиваем..." : "Запросить код"}
        </Button>
        <Button
          block
          variant={codeSent ? "primary" : "secondary"}
          disabled={isLoading || !phone.trim() || !code.trim()}
        >
          <BadgeCheck className="h-4 w-4" />
          {isLoading && codeSent ? "Проверяем..." : "Открыть веб-клиент"}
        </Button>
      </div>
    </form>
  );
}
