import { motion } from "framer-motion";
import { BadgeCheck, KeyRound, Sparkles } from "lucide-react";
import { useState } from "react";
import { DemoAccountCard } from "../components/auth/DemoAccountCard";
import { LoginForm } from "../components/auth/LoginForm";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { authStore } from "../store/authStore";

const demoAccounts = [
  {
    name: "Анна Demo",
    contact: "+15551230011",
    password: "demo1111",
    accentClassName:
      "bg-[linear-gradient(145deg,rgba(236,72,153,0.34),rgba(15,23,42,0.9))] hover:border-pink-300/40",
  },
  {
    name: "Борис Demo",
    contact: "+15551230012",
    password: "demo2222",
    accentClassName:
      "bg-[linear-gradient(145deg,rgba(59,130,246,0.34),rgba(15,23,42,0.9))] hover:border-blue-300/40",
  },
  {
    name: "Вера Demo",
    contact: "+15551230013",
    password: "demo3333",
    accentClassName:
      "bg-[linear-gradient(145deg,rgba(16,185,129,0.34),rgba(15,23,42,0.9))] hover:border-emerald-300/40",
  },
  {
    name: "Глеб Demo",
    contact: "+15551230014",
    password: "demo4444",
    accentClassName:
      "bg-[linear-gradient(145deg,rgba(245,158,11,0.34),rgba(15,23,42,0.9))] hover:border-amber-300/40",
  },
  {
    name: "Даша Demo",
    contact: "+15551230015",
    password: "demo5555",
    accentClassName:
      "bg-[linear-gradient(145deg,rgba(168,85,247,0.34),rgba(15,23,42,0.9))] hover:border-violet-300/40",
  },
] as const;

export function LoginPage() {
  const {
    login,
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
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(236,72,153,0.2),_transparent_32%),radial-gradient(circle_at_bottom,_rgba(34,211,238,0.18),_transparent_34%),linear-gradient(180deg,#09090b_0%,#111827_46%,#020617_100%)] px-4 py-8 sm:px-6 sm:py-10">
      <div className="glass-orb left-[-5rem] top-[5rem] h-52 w-52 bg-fuchsia-500/28" />
      <div className="glass-orb right-[6%] top-[12%] h-64 w-64 bg-amber-400/20" />
      <div className="glass-orb bottom-8 left-[18%] h-56 w-56 bg-cyan-400/20" />

      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <header className="space-y-4 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/[0.08] px-4 py-2 text-xs uppercase tracking-[0.28em] text-white/90">
              <Sparkles className="h-3.5 w-3.5" />
              Demo version
            </div>
            <div className="space-y-3">
              <h1 className="bg-gradient-to-r from-amber-200 via-fuchsia-200 to-cyan-200 bg-clip-text text-5xl font-semibold tracking-tight text-transparent sm:text-7xl">
                Mobile Messenger
              </h1>
              <p className="text-lg font-medium uppercase tracking-[0.26em] text-white/80 sm:text-xl">
                Регистрация / Вход
              </p>
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-[460px_minmax(0,1fr)]">
            <Card className="relative overflow-hidden border-white/14 bg-slate-950/55 p-6 sm:p-8">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
              <div className="space-y-6">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="warning">Номер</Badge>
                  <Badge tone="success">Код</Badge>
                  <Badge tone="neutral">Вход</Badge>
                </div>
                <div className="space-y-3">
                  <h2 className="text-3xl font-semibold text-white">
                    Вход по коду
                  </h2>
                  <p className="text-sm leading-6 text-white/68">
                    Введите номер, запросите код и подтвердите вход.
                  </p>
                </div>

                <LoginForm
                  isLoading={isLoading}
                  error={error}
                  codeSent={codeSent}
                  helperText={requestInfo}
                  telegramHint="Сначала откройте Telegram, затем запросите код и введите его здесь."
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
                    setRequestInfo(
                      `Код отправлен через ${response.delivery}. Повтор через ${response.resendAfterSeconds} сек.`,
                    );
                  }}
                  onVerifyCode={async ({ phone, code }) => {
                    clearError();
                    await verifyCode(phone.trim(), code.trim());
                  }}
                />
              </div>
            </Card>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.26em] text-white/60">
                    Demo accounts
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold text-white">
                    Быстрый вход
                  </h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/[0.08] px-4 py-2 text-sm text-white">
                  <KeyRound className="h-4 w-4" />
                  5 аккаунтов
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {demoAccounts.map((account, index) => (
                  <motion.div
                    key={account.contact}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <DemoAccountCard
                      name={account.name}
                      phone={account.contact}
                      code={account.password}
                      accentClassName={account.accentClassName}
                      onSelect={() =>
                        void login({
                          method: "phone",
                          contact: account.contact,
                          password: account.password,
                        })
                      }
                    />
                  </motion.div>
                ))}
              </div>

              <Card className="border-white/14 bg-white/[0.06] p-5">
                <div className="flex flex-wrap items-center gap-3 text-white">
                  <BadgeCheck className="h-5 w-5 text-emerald-300" />
                  <span className="text-sm font-medium">
                    Demo вход без лишней информации
                  </span>
                </div>
              </Card>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
