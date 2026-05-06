import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Command,
  MapPinned,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { LoginForm } from "../components/auth/LoginForm";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { authStore } from "../store/authStore";

const featureCards = [
  {
    icon: Zap,
    title: "Live messaging",
    description:
      "Нативный WebSocket, статус доставки, typing и чтение без перезагрузки.",
  },
  {
    icon: MapPinned,
    title: "Private map",
    description:
      "Публикуйте геопозицию только по явному действию и открывайте диалог прямо с карты.",
  },
  {
    icon: ShieldCheck,
    title: "Separate access",
    description:
      "Пользовательский вход и admin console разделены на уровне интерфейса и сессий.",
  },
] as const;

export function LoginPage() {
  const {
    requestTelegramPairing,
    requestCode,
    verifyCode,
    isLoading,
    error,
    clearError,
  } = authStore();
  const [requestInfo, setRequestInfo] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);

  return (
    <div className="app-page app-page--auth px-4 py-8 sm:px-6 sm:py-10">
      <div className="app-grid-fade" />
      <div className="glass-orb left-[-5rem] top-[5rem] h-52 w-52 bg-amber-400/26" />
      <div className="glass-orb right-[6%] top-[12%] h-64 w-64 bg-cyan-400/18" />
      <div className="glass-orb bottom-8 left-[18%] h-56 w-56 bg-emerald-400/14" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="app-kicker">
              <Command className="h-3.5 w-3.5" />
              Mobile Messenger Web
            </div>
            <Link
              to="/admin/login"
              className="inline-flex items-center gap-2 rounded-[22px] border border-white/12 bg-white/[0.06] px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
            >
              Admin console
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_460px]">
            <section className="space-y-6">
              <header className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="success">Realtime</Badge>
                  <Badge tone="neutral">Telegram auth</Badge>
                  <Badge tone="warning">Web workspace</Badge>
                </div>
                <div className="space-y-4">
                  <h1 className="max-w-4xl bg-gradient-to-r from-white via-slate-100 to-cyan-100 bg-clip-text text-5xl font-semibold tracking-[-0.04em] text-transparent sm:text-7xl">
                    Веб-клиент, который выглядит как готовый продукт.
                  </h1>
                  <p className="max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                    Один аккуратный вход для живых чатов, контактов, карты и
                    отдельной admin-консоли без временных заглушек на первом
                    экране.
                  </p>
                </div>
              </header>

              <Card className="app-shell overflow-hidden p-6 sm:p-8">
                <div className="grid gap-4 md:grid-cols-3">
                  {featureCards.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div
                        key={feature.title}
                        className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.06]">
                          <Icon className="h-5 w-5 text-cyan-100" />
                        </div>
                        <h2 className="mt-5 text-lg font-semibold text-white">
                          {feature.title}
                        </h2>
                        <p className="mt-3 text-sm leading-7 text-slate-400">
                          {feature.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="app-shell p-6 sm:p-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="app-kicker">
                      <Sparkles className="h-3.5 w-3.5" />
                      Product notes
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold text-white">
                      Реальный backend-контракт, без моков на входе
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
                      Экран не скрывает рабочую механику: Telegram pairing,
                      выдача кода, восстановление сессии и дальнейший переход в
                      полноценный messenger workspace.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 lg:w-[360px]">
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4">
                      <p className="app-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Auth
                      </p>
                      <p className="mt-3 text-sm font-semibold text-white">
                        Code-based
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4">
                      <p className="app-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Realtime
                      </p>
                      <p className="mt-3 text-sm font-semibold text-white">
                        WebSocket
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4">
                      <p className="app-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Privacy
                      </p>
                      <p className="mt-3 text-sm font-semibold text-white">
                        Opt-in map
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            <Card className="app-shell relative overflow-hidden p-6 sm:p-8">
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="app-kicker">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Secure access
                  </div>
                  <h2 className="text-3xl font-semibold text-white">
                    Вход по номеру и коду
                  </h2>
                  <p className="text-sm leading-7 text-slate-400">
                    Введите номер, свяжите Telegram и подтвердите одноразовый
                    код, чтобы открыть веб-пространство.
                  </p>
                </div>

                <LoginForm
                  isLoading={isLoading}
                  error={error}
                  codeSent={codeSent}
                  helperText={requestInfo}
                  telegramHint="Сначала откройте Telegram и отправьте боту свой контакт. После привязки можно запрашивать одноразовый код прямо из веб-клиента."
                  onLinkTelegram={async ({ phone }) => {
                    clearError();
                    const response = await requestTelegramPairing(phone.trim());
                    window.open(
                      response.telegramStartUrl,
                      "_blank",
                      "noopener,noreferrer",
                    );
                    setCodeSent(false);
                    setRequestInfo(
                      `Telegram открыт. Ссылка активна ${response.expiresIn} сек.`,
                    );
                  }}
                  onRequestCode={async ({ phone }) => {
                    clearError();
                    const response = await requestCode(phone.trim());
                    setCodeSent(true);
                    const parts = [
                      `Код отправлен через ${response.delivery}.`,
                      `Повтор через ${response.resendAfterSeconds} сек.`,
                      response.debugCode
                        ? `Тестовый код для текущего провайдера: ${response.debugCode}.`
                        : null,
                    ].filter(Boolean);
                    setRequestInfo(parts.join(" "));
                  }}
                  onVerifyCode={async ({ phone, code }) => {
                    clearError();
                    await verifyCode(phone.trim(), code.trim());
                  }}
                />
              </div>
            </Card>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
