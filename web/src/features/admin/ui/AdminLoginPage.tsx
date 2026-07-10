import { ArrowLeft, LockKeyhole, Server, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Input } from "@/components/ui/Input";
import { adminStore } from "@/features/admin/model/adminStore";

export function AdminLoginPage() {
  const { login, isLoading, error, clearError } = adminStore();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="app-page app-page--admin px-4 py-8 sm:px-6 sm:py-10">
      <div className="app-grid-fade" />
      <div className="glass-orb left-[8%] top-[10%] h-48 w-48 bg-amber-400/16" />
      <div className="glass-orb right-[10%] top-[12%] h-56 w-56 bg-cyan-400/14" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section className="app-shell space-y-6 rounded-[36px] p-6 sm:p-8">
            <div className="app-kicker">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin console
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Mobile Messenger Admin
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                Отдельная control plane-зона для системного статуса, логов,
                конфигурации авторизации и инфраструктурных метрик.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.06]">
                  <Server className="h-5 w-5 text-cyan-100" />
                </div>
                <h2 className="mt-5 text-lg font-semibold text-white">
                  System visibility
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  Backend health, runtime config, request logs и свежая
                  активность в одном защищённом интерфейсе.
                </p>
              </Card>

              <Card className="p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.06]">
                  <LockKeyhole className="h-5 w-5 text-amber-100" />
                </div>
                <h2 className="mt-5 text-lg font-semibold text-white">
                  Config-based access
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  Используйте данные, заданные на сервере через `ADMIN_LOGIN` и
                  `ADMIN_PASSWORD`.
                </p>
              </Card>
            </div>

            <Card className="p-5">
              <p className="app-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Access policy
              </p>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Эта сессия отделена от пользовательских аккаунтов и
                предназначена только для защищённых `admin` и
                `system`-маршрутов.
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                Если вход ещё не настроен, сначала задайте переменные окружения
                на backend-стороне и только потом возвращайтесь к этой форме.
              </p>
            </Card>

            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-[22px] border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Вернуться к пользовательскому входу
            </Link>
          </section>

          <Card className="app-shell p-6 sm:p-8">
            <form
              className="space-y-5"
              onSubmit={async (event) => {
                event.preventDefault();
                clearError();
                await login({
                  login: loginValue.trim(),
                  password,
                });
              }}
            >
              <div className="space-y-3">
                <div className="app-kicker">
                  <LockKeyhole className="h-3.5 w-3.5" />
                  Protected sign in
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  Открыть admin workspace
                </h2>
                <p className="text-sm leading-7 text-slate-400">
                  Введите системные учётные данные из серверной конфигурации.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-white"
                  htmlFor="admin-login"
                >
                  Login
                </label>
                <Input
                  id="admin-login"
                  aria-label="Admin login"
                  value={loginValue}
                  onChange={(event) => setLoginValue(event.target.value)}
                  placeholder="ADMIN_LOGIN"
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-white"
                  htmlFor="admin-password"
                >
                  Password
                </label>
                <Input
                  id="admin-password"
                  aria-label="Admin password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="ADMIN_PASSWORD"
                />
              </div>

              {error ? (
                <InlineAlert tone="danger" title="Admin sign-in">
                  {error}
                </InlineAlert>
              ) : null}

              <Button
                block
                size="lg"
                isLoading={isLoading}
                disabled={isLoading || !loginValue.trim() || !password.trim()}
              >
                Открыть админку
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
