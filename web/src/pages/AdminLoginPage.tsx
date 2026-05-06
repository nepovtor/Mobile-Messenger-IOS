import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { InlineAlert } from "../components/ui/InlineAlert";
import { Input } from "../components/ui/Input";
import { adminStore } from "../store/adminStore";

export function AdminLoginPage() {
  const { login, isLoading, error, clearError } = adminStore();
  const [loginValue, setLoginValue] = useState("admin");
  const [password, setPassword] = useState("admin");

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.16),_transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_46%,#020617_100%)] px-4 py-8 sm:px-6 sm:py-10">
      <div className="glass-orb left-[8%] top-[10%] h-48 w-48 bg-emerald-400/18" />
      <div className="glass-orb right-[10%] top-[12%] h-56 w-56 bg-sky-400/14" />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-5 rounded-[36px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-xs uppercase tracking-[0.24em] text-emerald-100">
              <ShieldCheck className="h-3.5 w-3.5" />
              Separate admin access
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Mobile Messenger Admin
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                Отдельный вход для управления системой. Пользовательские
                аккаунты сюда больше не привязаны.
              </p>
            </div>

            <Card className="border-white/10 bg-slate-950/45 p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Demo access
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Login
                  </p>
                  <p className="mt-2 font-semibold text-white">admin</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Password
                  </p>
                  <p className="mt-2 font-semibold text-white">admin</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-400">
                Если demo-аккаунты включены, demo admin вход работает по
                умолчанию. Для своего конфига задай `ADMIN_LOGIN` и
                `ADMIN_PASSWORD`.
              </p>
            </Card>

            <Link
              to="/"
              className="inline-flex items-center rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              Вернуться к пользовательскому входу
            </Link>
          </section>

          <Card className="border-white/12 bg-slate-950/55 p-6 sm:p-8">
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
                  placeholder="admin"
                  className="border-white/12 bg-slate-950/72"
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
                  placeholder="admin"
                  className="border-white/12 bg-slate-950/72"
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
