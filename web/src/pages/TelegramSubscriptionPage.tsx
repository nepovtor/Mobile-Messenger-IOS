import clsx from "clsx";
import {
  ArrowLeft,
  BadgeCheck,
  Crown,
  MapPinned,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { appConfig } from "../config/api";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { InlineAlert } from "../components/ui/InlineAlert";

type PlanID = "starter" | "team" | "business";

const plans: Array<{
  id: PlanID;
  name: string;
  price: string;
  audience: string;
  accentClassName: string;
  features: string[];
}> = [
  {
    id: "starter",
    name: "Starter",
    price: "$4.99 / month",
    audience: "Для личного использования",
    accentClassName:
      "border-cyan-300/20 bg-[linear-gradient(145deg,rgba(34,211,238,0.18),rgba(15,23,42,0.94))]",
    features: [
      "7-day demo trial",
      "быстрый доступ к новым функциям",
      "приоритетные уведомления",
    ],
  },
  {
    id: "team",
    name: "Team",
    price: "$14.99 / month",
    audience: "Для команд и небольших проектов",
    accentClassName:
      "border-amber-300/20 bg-[linear-gradient(145deg,rgba(251,191,36,0.2),rgba(15,23,42,0.94))]",
    features: [
      "общие пространства команды",
      "расширенная история локаций",
      "быстрый onboarding участников",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: "$39 / month",
    audience: "Для ops и admin-сценариев",
    accentClassName:
      "border-emerald-300/20 bg-[linear-gradient(145deg,rgba(16,185,129,0.2),rgba(15,23,42,0.94))]",
    features: [
      "расширенные роли и контроль",
      "отдельная admin-среда",
      "приоритетная поддержка",
    ],
  },
];

const benefits = [
  {
    icon: Sparkles,
    title: "Mini app in Telegram",
    description: "Открывается прямо из бота как отдельная витрина подписки.",
  },
  {
    icon: ShieldCheck,
    title: "Separate offer flow",
    description: "Пользователь видит подписку отдельно от логина и привязки.",
  },
  {
    icon: MapPinned,
    title: "Product scenarios",
    description: "Показывает, зачем нужен тариф для geo, chat и admin use cases.",
  },
  {
    icon: Users,
    title: "Team upsell",
    description: "Есть отдельные варианты для personal, team и business.",
  },
] as const;

function getBotDeepLink(plan: PlanID) {
  const botUrl = appConfig.telegramBotUrl;
  return botUrl ? `${botUrl}?start=subscription_${plan}` : null;
}

function getInitialPlan(): PlanID {
  const params = new URLSearchParams(window.location.search);
  const plan = params.get("plan");
  if (plan === "starter" || plan === "team" || plan === "business") {
    return plan;
  }
  return "team";
}

export function TelegramSubscriptionPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanID>(getInitialPlan);

  useEffect(() => {
    const telegramWebApp = (
      window as Window & {
        Telegram?: {
          WebApp?: {
            ready?: () => void;
            expand?: () => void;
            close?: () => void;
          };
        };
      }
    ).Telegram?.WebApp;

    telegramWebApp?.ready?.();
    telegramWebApp?.expand?.();
  }, []);

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlan) ?? plans[1],
    [selectedPlan],
  );

  function handleClose() {
    const telegramWebApp = (
      window as Window & {
        Telegram?: {
          WebApp?: {
            close?: () => void;
          };
        };
      }
    ).Telegram?.WebApp;

    if (telegramWebApp?.close) {
      telegramWebApp.close();
      return;
    }

    const deepLink = getBotDeepLink(activePlan.id);
    if (deepLink) {
      window.location.href = deepLink;
      return;
    }

    window.location.href = "/";
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(250,204,21,0.16),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(16,185,129,0.14),_transparent_32%),linear-gradient(180deg,#020617_0%,#0f172a_46%,#020617_100%)] px-4 py-5 sm:px-6 sm:py-8">
      <div className="glass-orb left-[-4rem] top-[2rem] h-40 w-40 bg-sky-400/20" />
      <div className="glass-orb right-[5%] top-[10%] h-48 w-48 bg-amber-400/18" />

      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">Telegram Mini App</Badge>
              <Badge tone="warning">Demo subscription</Badge>
              <Badge tone="neutral">Mobile Messenger Plus</Badge>
            </div>

            <div className="space-y-3">
              <h1 className="bg-gradient-to-r from-sky-200 via-white to-amber-200 bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-6xl">
                Subscription Showcase
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                Отдельное Telegram-приложение, которое предлагает подписку в
                понятном формате: тарифы, преимущества и быстрый возврат в чат.
              </p>
            </div>
          </div>

          <Button variant="secondary" onClick={handleClose}>
            <ArrowLeft className="h-4 w-4" />
            Вернуться в Telegram
          </Button>
        </header>

        <InlineAlert tone="info" title="Demo mode">
          Это витрина подписки. Платёжный checkout в этой сборке пока не
          подключён, но страница уже готова для показа в Telegram.
        </InlineAlert>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_440px]">
          <section className="space-y-5">
            <Card className="overflow-hidden border-white/12 p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-sky-200/80">
                    Featured plan
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold text-white">
                    {activePlan.name}
                  </h2>
                  <p className="mt-2 text-lg text-white/80">
                    {activePlan.price}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {activePlan.audience}
                  </p>
                </div>
                <div className="rounded-[26px] border border-white/10 bg-white/[0.05] p-4">
                  <Crown className="h-9 w-9 text-amber-300" />
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {activePlan.features.map((feature) => (
                  <div
                    key={feature}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-200"
                  >
                    {feature}
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  onClick={() => {
                    const deepLink = getBotDeepLink(activePlan.id);
                    if (deepLink) {
                      window.location.href = deepLink;
                    }
                  }}
                >
                  <Zap className="h-4 w-4" />
                  Выбрать {activePlan.name}
                </Button>
                <Button variant="secondary" onClick={handleClose}>
                  <BadgeCheck className="h-4 w-4" />
                  Вернуться в чат
                </Button>
              </div>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {benefits.map((benefit) => {
                const Icon = benefit.icon;
                return (
                  <Card key={benefit.title} className="border-white/10 p-5">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 w-fit">
                      <Icon className="h-5 w-5 text-sky-200" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-white">
                      {benefit.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {benefit.description}
                    </p>
                  </Card>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={clsx(
                  "cursor-pointer border p-5 transition hover:-translate-y-0.5 hover:border-white/20",
                  plan.accentClassName,
                  selectedPlan === plan.id && "ring-2 ring-white/22",
                )}
                onClick={() => setSelectedPlan(plan.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-white/65">
                      {plan.name}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {plan.price}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {plan.audience}
                    </p>
                  </div>
                  {selectedPlan === plan.id ? (
                    <Badge tone="success">Selected</Badge>
                  ) : null}
                </div>

                <div className="mt-4 space-y-2">
                  {plan.features.map((feature) => (
                    <div
                      key={feature}
                      className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100"
                    >
                      {feature}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}
