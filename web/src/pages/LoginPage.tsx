import { motion } from "framer-motion";
import {
  Compass,
  MessageSquareText,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { DemoAccountCard } from "../components/auth/DemoAccountCard";
import { DemoGuideModal } from "../components/auth/DemoGuideModal";
import { DemoPasswordForm, LoginForm } from "../components/auth/LoginForm";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { authStore } from "../store/authStore";

const demoAccounts = [
  {
    name: "Анна Demo",
    contact: "+15551230011",
    password: "demo1111",
    description: "Учебные чаты и личная переписка",
  },
  {
    name: "Борис Demo",
    contact: "+15551230012",
    password: "demo2222",
    description: "Командные обсуждения и direct chat",
  },
  {
    name: "Вера Demo",
    contact: "+15551230013",
    password: "demo3333",
    description: "Изолированный личный сценарий",
  },
  {
    name: "Глеб Demo",
    contact: "+15551230014",
    password: "demo4444",
    description: "Рабочие диалоги и общая команда",
  },
  {
    name: "Даша Demo",
    contact: "+15551230015",
    password: "demo5555",
    description: "Только групповой Demo Team чат",
  },
] as const;

const featureCards = [
  {
    title: "Native WebSocket realtime",
    description:
      "Live chats, typing events, and message state updates without page refreshes.",
    icon: Radio,
  },
  {
    title: "Telegram verification",
    description:
      "Secure phone sign-in flow with Telegram pairing and code delivery.",
    icon: ShieldCheck,
  },
  {
    title: "Contacts and group chats",
    description:
      "Direct and shared conversations for demo-ready collaboration flows.",
    icon: MessageSquareText,
  },
  {
    title: "Location sharing with privacy controls",
    description:
      "Opt-in sharing, latest-point storage, and contact-only visibility on the map.",
    icon: Compass,
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
  const [isGuideOpen, setGuideOpen] = useState(false);

  return (
    <>
      <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.24),_transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] px-4 py-10 sm:px-6">
        <div className="glass-orb left-[-6rem] top-14 h-48 w-48 bg-cyan-400/35" />
        <div className="glass-orb right-[8%] top-[16%] h-64 w-64 bg-indigo-500/25" />
        <div className="glass-orb bottom-10 left-[22%] h-56 w-56 bg-sky-400/18" />

        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr]"
          >
            <div className="space-y-6">
              <div className="max-w-3xl space-y-5">
                <p className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-cyan-200">
                  Mobile Messenger Web
                </p>
                <div className="space-y-4">
                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
                    Mobile Messenger
                  </h1>
                  <p className="max-w-2xl text-lg leading-8 text-slate-200 sm:text-2xl">
                    Secure realtime messenger with iOS, Web and NestJS backend
                  </p>
                  <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                    Premium demo-ready interface for coursework defense:
                    realtime messaging, Telegram verification, contacts, profile
                    editing, and privacy-first location sharing in one coherent
                    product flow.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => setGuideOpen(true)}>
                    <Sparkles className="h-4 w-4" />
                    Demo guide
                  </Button>
                  <div className="rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-sm text-slate-200">
                    5 demo accounts ready for instant sign-in
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {featureCards.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <motion.div
                      key={feature.title}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className="h-full p-5 transition duration-200 hover:-translate-y-1 hover:border-cyan-300/20 hover:bg-white/10">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-400/10 text-cyan-100">
                          <Icon className="h-5 w-5" />
                        </div>
                        <h3 className="mt-4 text-lg font-semibold text-white">
                          {feature.title}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {feature.description}
                        </p>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>

              <Card className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">
                      Demo accounts
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold text-white">
                      One-click access for the defense flow
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                      Choose a ready persona, enter the messenger instantly, and
                      demonstrate chats, contacts, profile, and map without
                      changing backend behavior.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 hover:text-white"
                    onClick={() => setGuideOpen(true)}
                  >
                    View guide
                  </button>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {demoAccounts.map((account, index) => (
                    <motion.div
                      key={account.contact}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + index * 0.05 }}
                    >
                      <DemoAccountCard
                        name={account.name}
                        phone={account.contact}
                        code={account.password}
                        description={account.description}
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
              </Card>
            </div>

            <Card className="relative overflow-hidden p-6 sm:p-8">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
              <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />

              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="inline-flex rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-200">
                    Auth
                  </div>
                  <h2 className="text-2xl font-semibold text-white sm:text-3xl">
                    Landing, login and Telegram verification
                  </h2>
                  <p className="text-sm leading-6 text-slate-300">
                    Для реального входа сначала привяжите Telegram-бота и
                    отправьте свой контакт. Demo accounts работают без изменения
                    API contract и готовы для защиты.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {["Realtime ready", "Demo accounts", "No debug data"].map(
                    (label) => (
                      <div
                        key={label}
                        className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-200"
                      >
                        {label}
                      </div>
                    ),
                  )}
                </div>

                <LoginForm
                  isLoading={isLoading}
                  error={error}
                  codeSent={codeSent}
                  helperText={requestInfo}
                  telegramHint="Для реального входа сначала привяжите Telegram-бота и отправьте свой контакт. Затем вернитесь сюда, получите код и подтвердите вход."
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
                      `Telegram link ready. Send your own contact to the bot and return here within ${response.expiresIn} seconds.`,
                    );
                  }}
                  onRequestCode={async ({ phone }) => {
                    clearError();
                    const response = await requestCode(phone.trim());
                    setCodeSent(true);
                    setRequestInfo(
                      `Code sent via ${response.delivery}. You can request another one in ${response.resendAfterSeconds} seconds.`,
                    );
                  }}
                  onVerifyCode={async ({ phone, code }) => {
                    clearError();
                    await verifyCode(phone.trim(), code.trim());
                  }}
                />

                <div className="rounded-[28px] border border-white/10 bg-slate-950/45 p-4">
                  <div className="mb-3">
                    <div className="text-sm font-medium text-white">
                      Manual demo sign-in
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Use this if you want to type the demo credentials instead
                      of clicking the cards.
                    </p>
                  </div>
                  <DemoPasswordForm
                    isLoading={isLoading}
                    error={null}
                    onSubmit={(payload) =>
                      login({
                        method: "phone",
                        contact: payload.contact,
                        password: payload.password,
                      })
                    }
                  />
                </div>

                <div className="rounded-[28px] border border-white/10 bg-slate-950/45 p-4 text-sm leading-6 text-slate-300">
                  Sessions are restored without exposing API endpoints or tokens
                  in the UI. Logout fully clears the local token, user state,
                  chats, and realtime connection before the next sign-in.
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>

      <DemoGuideModal open={isGuideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
