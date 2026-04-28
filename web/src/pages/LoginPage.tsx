import { motion } from "framer-motion";
import { DemoAccountCard } from "../components/auth/DemoAccountCard";
import { LoginForm } from "../components/auth/LoginForm";
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
];

export function LoginPage() {
  const { login, isLoading, error } = authStore();

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.24),_transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]"
        >
          <div className="space-y-6">
            <div className="max-w-2xl space-y-4">
              <p className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-cyan-200">
                Mobile Messenger Web
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
                Production-backed messenger for live demo conversations.
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                Open the web client, sign in with a demo account, switch between chats,
                and show realtime messaging like a polished product instead of a mockup.
              </p>
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
          </div>

          <Card className="relative overflow-hidden p-6 sm:p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-white">Manual sign in</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Use any of the demo credentials shown on the left, or quick-sign in
                  directly from the cards.
                </p>
              </div>
              <LoginForm
                isLoading={isLoading}
                error={error}
                onSubmit={(payload) =>
                  login({
                    method: "phone",
                    contact: payload.contact,
                    password: payload.password,
                  })
                }
              />
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-400">
                Different demo users see different chats. Logout fully clears session,
                local state, and realtime connection before the next sign-in.
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
