import clsx from "clsx";
import {
  Activity,
  ArrowLeft,
  LogOut,
  RefreshCcw,
  ScrollText,
  Server,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/httpClient";
import { systemApi } from "../api/systemApi";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { InlineAlert } from "../components/ui/InlineAlert";
import { adminStore } from "../store/adminStore";
import type {
  BackendHealthInfo,
  BackendVersionInfo,
  SystemLogEntry,
  SystemOverview,
} from "../types/system";
import { formatRelativeStatus } from "../utils/date";

type AdminTab = "overview" | "activity" | "infrastructure" | "logs";

type DecodedJwt = {
  sub?: string;
  login?: string;
  role?: string;
  displayName?: string;
  contact?: string;
  method?: string;
  phone?: string;
  iat?: number;
  exp?: number;
};

const adminTabs = [
  {
    id: "overview" as const,
    label: "Overview",
    icon: Server,
  },
  {
    id: "activity" as const,
    label: "Activity",
    icon: Activity,
  },
  {
    id: "infrastructure" as const,
    label: "Infrastructure",
    icon: Wrench,
  },
  {
    id: "logs" as const,
    label: "Logs",
    icon: ScrollText,
  },
] as const;

const repoFallback = {
  typescript: {
    strict: true,
    target: "es2021",
    module: "Node16",
  },
  docker: {
    rootDockerfilePresent: true,
    serverDockerfilePresent: true,
    composeFilePresent: true,
  },
  logging: {
    requestFile: "requests.log",
    errorFile: "errors.log",
  },
  database: {
    driver: "postgres",
    orm: "typeorm",
  },
} as const;

function decodeJwtPayload(token: string | null): DecodedJwt | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = window.atob(
      normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="),
    );
    return JSON.parse(decoded) as DecodedJwt;
  } catch {
    return null;
  }
}

function formatDateTime(value?: string | number | null) {
  if (!value) {
    return "n/a";
  }

  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatUptime(seconds: number | null) {
  if (seconds == null) {
    return "n/a";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

function formatSessionExpiry(value?: number) {
  return typeof value === "number" ? formatDateTime(value) : "n/a";
}

function isMissingSystemRoute(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 404 &&
    /\/api\/system\//i.test(error.message)
  );
}

function tailPath(value: string) {
  const segments = value.split("/");
  return segments[segments.length - 1] || value;
}

function metaString(meta: Record<string, unknown> | null, key: string) {
  const value = meta?.[key];
  return typeof value === "string" ? value : null;
}

function metaNumber(meta: Record<string, unknown> | null, key: string) {
  const value = meta?.[key];
  return typeof value === "number" ? value : null;
}

function prettyMeta(meta: Record<string, unknown> | null) {
  if (!meta) {
    return null;
  }

  return JSON.stringify(meta, null, 2);
}

function toneForBool(value: boolean | null): "success" | "warning" | "neutral" {
  if (value === true) {
    return "success";
  }
  if (value === false) {
    return "warning";
  }
  return "neutral";
}

function toneForMessageStatus(
  status: string,
): "success" | "warning" | "danger" {
  if (status === "read" || status === "delivered" || status === "sent") {
    return "success";
  }
  if (status === "failed") {
    return "danger";
  }
  return "warning";
}

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
          {label}
        </p>
        <Badge tone={tone} pulseDot={tone !== "neutral"}>
          {tone === "neutral" ? "Info" : tone === "success" ? "Live" : tone}
        </Badge>
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{hint}</p>
    </Card>
  );
}

function StatusRow({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <span className="text-sm text-slate-300">{label}</span>
      <Badge tone={toneForBool(value)} pulseDot={value !== null}>
        {value === true ? "Ready" : value === false ? "Missing" : "Unknown"}
      </Badge>
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.04] px-5 py-10 text-center">
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{message}</p>
    </div>
  );
}

function ActivityList({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <SectionCard title={title} description={description}>
      <div className="space-y-3">{children}</div>
    </SectionCard>
  );
}

function LogFeed({
  title,
  description,
  entries,
  emptyMessage,
  unavailable,
}: {
  title: string;
  description: string;
  entries: SystemLogEntry[];
  emptyMessage: string;
  unavailable: boolean;
}) {
  return (
    <SectionCard
      title={title}
      description={description}
      action={
        <Badge tone={entries.length > 0 ? "success" : "neutral"}>
          {entries.length} entries
        </Badge>
      }
    >
      {unavailable ? (
        <EmptyState
          title="Live logs unavailable"
          message="The current backend deployment does not expose the protected /api/system log routes yet."
        />
      ) : entries.length === 0 ? (
        <EmptyState title="No entries yet" message={emptyMessage} />
      ) : (
        <div className="space-y-3">
          {entries.map((entry, index) => {
            const method = metaString(entry.meta, "method");
            const url = metaString(entry.meta, "url");
            const statusCode = metaNumber(entry.meta, "statusCode");
            const durationMs = metaNumber(entry.meta, "durationMs");
            const metaDump = prettyMeta(entry.meta);

            return (
              <details
                key={`${entry.timestamp}-${entry.message}-${index}`}
                className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={entry.level === "error" ? "danger" : "success"}
                        >
                          {entry.level}
                        </Badge>
                        <span className="text-sm font-medium text-white">
                          {method && url ? `${method} ${url}` : entry.message}
                        </span>
                      </div>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {formatDateTime(entry.timestamp)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                      {typeof statusCode === "number" ? (
                        <Badge tone={statusCode >= 500 ? "danger" : "neutral"}>
                          {statusCode}
                        </Badge>
                      ) : null}
                      {typeof durationMs === "number" ? (
                        <Badge tone="neutral">{durationMs} ms</Badge>
                      ) : null}
                    </div>
                  </div>
                </summary>

                {metaDump ? (
                  <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-6 text-slate-300">
                    {metaDump}
                  </pre>
                ) : null}
              </details>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

export function SystemPage() {
  const navigate = useNavigate();
  const {
    currentAdmin,
    isAuthenticated,
    token,
    error: adminError,
    clearError,
    logout,
  } = adminStore();

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [requestLogs, setRequestLogs] = useState<SystemLogEntry[]>([]);
  const [errorLogs, setErrorLogs] = useState<SystemLogEntry[]>([]);
  const [versionInfo, setVersionInfo] = useState<BackendVersionInfo | null>(
    null,
  );
  const [healthInfo, setHealthInfo] = useState<BackendHealthInfo | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [isRefreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [systemApiMissing, setSystemApiMissing] = useState(false);

  const jwtPayload = useMemo(() => decodeJwtPayload(token), [token]);

  async function hydrateAdminData() {
    const [
      overviewResult,
      requestLogsResult,
      errorLogsResult,
      versionResult,
      healthResult,
    ] = await Promise.allSettled([
      systemApi.getOverview(),
      systemApi.getRequestLogs(18),
      systemApi.getErrorLogs(12),
      systemApi.getVersion(),
      systemApi.getHealth(),
    ]);

    if (overviewResult.status === "fulfilled") {
      setOverview(overviewResult.value);
    } else {
      setOverview(null);
    }

    if (requestLogsResult.status === "fulfilled") {
      setRequestLogs(requestLogsResult.value);
    } else {
      setRequestLogs([]);
    }

    if (errorLogsResult.status === "fulfilled") {
      setErrorLogs(errorLogsResult.value);
    } else {
      setErrorLogs([]);
    }

    if (versionResult.status === "fulfilled") {
      setVersionInfo(versionResult.value);
    }

    if (healthResult.status === "fulfilled") {
      setHealthInfo(healthResult.value);
    }

    const systemErrors = [
      overviewResult,
      requestLogsResult,
      errorLogsResult,
    ].flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );

    const missingSystemRoutes = systemErrors.some((error) =>
      isMissingSystemRoute(error),
    );

    setSystemApiMissing(missingSystemRoutes);

    if (missingSystemRoutes) {
      setPageError(
        "Current backend deployment does not expose /api/system/* yet. Deploy the latest backend build or point the web client to your local backend.",
      );
      return;
    }

    if (systemErrors[0]) {
      setPageError(
        systemErrors[0] instanceof Error
          ? systemErrors[0].message
          : "Could not load the admin panel.",
      );
      return;
    }

    setPageError(null);
  }

  useEffect(() => {
    if (!isAuthenticated || !currentAdmin) {
      navigate("/admin/login", { replace: true });
      return;
    }

    let isDisposed = false;

    async function load() {
      setLoading(true);
      setPageError(null);
      setSystemApiMissing(false);

      try {
        await hydrateAdminData();
      } finally {
        if (!isDisposed) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void load();

    return () => {
      isDisposed = true;
    };
  }, [currentAdmin, isAuthenticated, navigate]);

  useEffect(() => {
    if (adminError) {
      navigate("/admin/login", { replace: true });
      clearError();
    }
  }, [adminError, clearError, navigate]);

  if (!currentAdmin) {
    return null;
  }

  async function handleRefresh() {
    setRefreshing(true);
    setPageError(null);
    setSystemApiMissing(false);

    try {
      await hydrateAdminData();
    } finally {
      setRefreshing(false);
    }
  }

  const displayedVersion =
    overview?.api.version ?? versionInfo?.version ?? "n/a";
  const displayedEnvironment =
    overview?.api.environment ??
    (systemApiMissing ? "Not exposed by current deployment" : "n/a");
  const displayedNodeVersion =
    overview?.api.nodeVersion ??
    (systemApiMissing ? "Not exposed by current deployment" : "n/a");
  const displayedUptime =
    overview?.api.uptimeSeconds ?? healthInfo?.uptime ?? null;
  const displayedGeneratedAt =
    overview?.generatedAt ?? healthInfo?.timestamp ?? null;
  const displayedTsStrict =
    overview?.typescript.strict ?? repoFallback.typescript.strict;
  const displayedTsTarget =
    overview?.typescript.target ?? repoFallback.typescript.target;
  const displayedTsModule =
    overview?.typescript.module ?? repoFallback.typescript.module;
  const displayedRequestLogFile =
    overview?.logging.requestFile ?? repoFallback.logging.requestFile;
  const displayedErrorLogFile =
    overview?.logging.errorFile ?? repoFallback.logging.errorFile;
  const displayedJwtConfigured =
    overview?.authentication.jwtConfigured ?? Boolean(token);
  const displayedJwtExpiresIn =
    overview?.authentication.jwtExpiresIn ??
    formatSessionExpiry(jwtPayload?.exp);
  const displayedBearerScheme =
    overview?.authentication.bearerScheme ?? "Bearer";
  const displayedAdminLogin =
    overview?.authentication.adminLogin ?? currentAdmin.login;
  const totalRows = overview
    ? Object.values(overview.database.counts).reduce(
        (sum, count) => sum + count,
        0,
      )
    : null;

  const recentUsers = overview?.database.recentUsers ?? [];
  const recentChats = overview?.database.recentChats ?? [];
  const recentMessages = overview?.database.recentMessages ?? [];

  return (
    <div className="app-page app-page--admin px-4 py-4 sm:px-6 sm:py-6">
      <div className="app-grid-fade" />
      <div className="glass-orb left-[-4rem] top-[4rem] h-44 w-44 bg-cyan-400/20" />
      <div className="glass-orb right-[10%] top-[10%] h-60 w-60 bg-orange-400/14" />

      <div className="relative z-10 mx-auto flex max-w-[1520px] flex-col gap-4">
        <Card className="app-shell overflow-hidden p-4 sm:p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="app-kicker">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin Console
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                Mobile Messenger Admin
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Separate workspace for backend health, auth configuration,
                recent activity, infrastructure status and live logs.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard
                label="Backend"
                value={displayedVersion}
                hint={displayedEnvironment}
                tone="success"
              />
              <MetricCard
                label="Session"
                value={displayedJwtConfigured ? "Bearer" : "No JWT"}
                hint={displayedJwtExpiresIn}
                tone={displayedJwtConfigured ? "success" : "warning"}
              />
              <MetricCard
                label="Database"
                value={totalRows != null ? String(totalRows) : "n/a"}
                hint={
                  totalRows != null
                    ? "Tracked rows"
                    : "Awaiting system API data"
                }
                tone={totalRows != null ? "success" : "neutral"}
              />
              <MetricCard
                label="Logs"
                value={String(requestLogs.length + errorLogs.length)}
                hint="Loaded entries"
                tone={
                  systemApiMissing
                    ? "warning"
                    : requestLogs.length + errorLogs.length > 0
                      ? "success"
                      : "neutral"
                }
              />
            </div>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="app-shell rounded-[32px] p-4">
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">
                      Admin access
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-white">
                      {currentAdmin.displayName}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      {displayedAdminLogin}
                    </p>
                  </div>
                  <Badge tone="success">{currentAdmin.role}</Badge>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-400">
                  This session is isolated from user accounts and is only used
                  for admin routes.
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="secondary"
                    onClick={() => navigate("/", { replace: true })}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    User login
                  </Button>
                  <Button variant="danger" onClick={logout}>
                    <LogOut className="h-4 w-4" />
                    Logout
                  </Button>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Admin refresh
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Sync overview, activity and logs from the protected system
                      endpoints.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={isRefreshing}
                    isLoading={isRefreshing}
                    onClick={() => void handleRefresh()}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </Card>

              <Card className="p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">
                  Session
                </p>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Subject
                    </p>
                    <p className="mt-2 break-all font-medium text-white">
                      {jwtPayload?.sub ?? `admin:${currentAdmin.login}`}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Expires
                    </p>
                    <p className="mt-2 font-medium text-white">
                      {formatSessionExpiry(jwtPayload?.exp)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Role
                    </p>
                    <p className="mt-2 font-medium text-white">
                      {jwtPayload?.role ?? currentAdmin.role}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </aside>

          <main className="space-y-4">
            {pageError ? (
              <InlineAlert
                tone={systemApiMissing ? "warning" : "danger"}
                title="Admin status"
              >
                {pageError}
              </InlineAlert>
            ) : null}

            <div className="grid gap-2 rounded-[24px] border border-white/10 bg-slate-950/40 p-1 sm:grid-cols-4">
              {adminTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={clsx(
                      "flex items-center justify-center gap-2 rounded-[18px] px-3 py-3 text-sm font-medium transition",
                      activeTab === tab.id
                        ? "bg-white/[0.12] text-white"
                        : "text-slate-400 hover:bg-white/[0.06] hover:text-white",
                    )}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab === "overview" ? (
              <div className="space-y-4">
                <SectionCard
                  title="Admin snapshot"
                  description="Live runtime state combined with safe fallbacks when the protected system API is not deployed yet."
                >
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Environment
                      </p>
                      <p className="mt-2 font-semibold text-white">
                        {displayedEnvironment}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Node.js
                      </p>
                      <p className="mt-2 font-semibold text-white">
                        {displayedNodeVersion}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Uptime
                      </p>
                      <p className="mt-2 font-semibold text-white">
                        {formatUptime(displayedUptime)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Refreshed
                      </p>
                      <p className="mt-2 font-semibold text-white">
                        {formatDateTime(displayedGeneratedAt)}
                      </p>
                    </div>
                  </div>
                </SectionCard>

                <div className="grid gap-4 xl:grid-cols-2">
                  <SectionCard
                    title="Authentication"
                    description="JWT state, login modes and provider configuration."
                  >
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        tone={displayedJwtConfigured ? "success" : "danger"}
                      >
                        JWT secret{" "}
                        {displayedJwtConfigured ? "configured" : "missing"}
                      </Badge>
                      <Badge tone="neutral">
                        Scheme: {displayedBearerScheme}
                      </Badge>
                      <Badge tone="neutral">
                        Expires: {displayedJwtExpiresIn}
                      </Badge>
                      <Badge
                        tone={
                          overview?.authentication.passwordLoginEnabled
                            ? "success"
                            : "warning"
                        }
                      >
                        Password login{" "}
                        {overview?.authentication.passwordLoginEnabled
                          ? "enabled"
                          : "unknown"}
                      </Badge>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Verification provider
                        </p>
                        <p className="mt-2 font-semibold capitalize text-white">
                          {overview?.authentication.verificationProvider ??
                            "n/a"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          SMS provider
                        </p>
                        <p className="mt-2 font-semibold capitalize text-white">
                          {overview?.authentication.smsProvider ?? "n/a"}
                        </p>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Infrastructure"
                    description="Database, storage and deployment readiness."
                  >
                    <div className="space-y-3">
                      <StatusRow
                        label="PostgreSQL / TypeORM"
                        value={overview?.database.connected ?? null}
                      />
                      <StatusRow
                        label="Root Dockerfile"
                        value={
                          overview?.docker.rootDockerfilePresent ??
                          repoFallback.docker.rootDockerfilePresent
                        }
                      />
                      <StatusRow
                        label="Server Dockerfile"
                        value={
                          overview?.docker.serverDockerfilePresent ??
                          repoFallback.docker.serverDockerfilePresent
                        }
                      />
                      <StatusRow
                        label="docker-compose"
                        value={
                          overview?.docker.composeFilePresent ??
                          repoFallback.docker.composeFilePresent
                        }
                      />
                      <StatusRow
                        label={`Storage bucket: ${
                          overview?.storage.bucket ?? "unknown"
                        }`}
                        value={overview?.storage.configured ?? null}
                      />
                    </div>
                  </SectionCard>
                </div>
              </div>
            ) : null}

            {activeTab === "activity" ? (
              <div className="space-y-4">
                {systemApiMissing ? (
                  <EmptyState
                    title="Activity requires the latest backend"
                    message="Deploy the current backend build to expose recent users, chats and messages inside the admin panel."
                  />
                ) : null}

                <div className="grid gap-4 xl:grid-cols-3">
                  <ActivityList
                    title="Recent users"
                    description="Latest created or reused user profiles in the database."
                  >
                    {recentUsers.length === 0 ? (
                      <EmptyState
                        title="No recent users"
                        message="Users will appear here once the backend starts returning activity data."
                      />
                    ) : (
                      recentUsers.map((user) => (
                        <div
                          key={user.id}
                          className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">
                                {user.displayName}
                              </p>
                              <p className="mt-1 text-sm text-slate-400">
                                {user.phone ?? user.contact}
                              </p>
                            </div>
                            <Badge tone="neutral">user</Badge>
                          </div>
                          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">
                            {formatRelativeStatus(user.createdAt)}
                          </p>
                        </div>
                      ))
                    )}
                  </ActivityList>

                  <ActivityList
                    title="Recent chats"
                    description="Newest chat updates ordered by last activity."
                  >
                    {recentChats.length === 0 ? (
                      <EmptyState
                        title="No recent chats"
                        message="Chats will appear here once activity data is available."
                      />
                    ) : (
                      recentChats.map((chat) => (
                        <div
                          key={chat.id}
                          className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">
                                {chat.title}
                              </p>
                              <p className="mt-1 line-clamp-2 text-sm text-slate-400">
                                {chat.lastMessagePreview || "No preview yet"}
                              </p>
                            </div>
                            <Badge tone="neutral">chat</Badge>
                          </div>
                          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">
                            {formatRelativeStatus(chat.lastActivity)}
                          </p>
                        </div>
                      ))
                    )}
                  </ActivityList>

                  <ActivityList
                    title="Recent messages"
                    description="Latest delivered, read or failed messages across chats."
                  >
                    {recentMessages.length === 0 ? (
                      <EmptyState
                        title="No recent messages"
                        message="Messages will appear here once activity data is available."
                      />
                    ) : (
                      recentMessages.map((message) => (
                        <div
                          key={message.id}
                          className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">
                                {message.authorName}
                              </p>
                              <p className="mt-1 text-sm text-slate-400">
                                {message.chatTitle ?? message.chatID}
                              </p>
                            </div>
                            <Badge tone={toneForMessageStatus(message.status)}>
                              {message.status}
                            </Badge>
                          </div>
                          <p className="mt-3 line-clamp-2 text-sm text-slate-300">
                            {message.preview || "Empty payload"}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge tone="neutral">{message.kind}</Badge>
                            <Badge tone="neutral">
                              {formatRelativeStatus(message.createdAt)}
                            </Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </ActivityList>
                </div>
              </div>
            ) : null}

            {activeTab === "infrastructure" ? (
              <div className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <SectionCard
                    title="TypeScript and runtime"
                    description="Compiler posture and runtime environment."
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Strict
                        </p>
                        <p className="mt-2 font-semibold text-white">
                          {String(displayedTsStrict)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Target
                        </p>
                        <p className="mt-2 font-semibold text-white">
                          {String(displayedTsTarget)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Module
                        </p>
                        <p className="mt-2 font-semibold text-white">
                          {String(displayedTsModule)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          API base
                        </p>
                        <p className="mt-2 font-semibold text-white">
                          {overview?.api.basePath ?? "/api"}
                        </p>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Storage and deployment"
                    description="Media bucket and local container assets."
                  >
                    <div className="space-y-3">
                      <StatusRow
                        label={`Request log file: ${tailPath(displayedRequestLogFile)}`}
                        value={
                          overview
                            ? Boolean(overview.logging.requestFile)
                            : null
                        }
                      />
                      <StatusRow
                        label={`Error log file: ${tailPath(displayedErrorLogFile)}`}
                        value={
                          overview ? Boolean(overview.logging.errorFile) : null
                        }
                      />
                      <StatusRow
                        label={`Storage bucket: ${overview?.storage.bucket ?? "unknown"}`}
                        value={overview?.storage.configured ?? null}
                      />
                      <StatusRow
                        label={`DB synchronize: ${
                          overview
                            ? overview.database.synchronize
                              ? "on"
                              : "off"
                            : "unknown"
                        }`}
                        value={overview ? !overview.database.synchronize : null}
                      />
                    </div>
                  </SectionCard>
                </div>

                <SectionCard
                  title="Protected routes"
                  description="Routes that expect a valid Bearer session before allowing access."
                >
                  <div className="flex flex-wrap gap-2">
                    {(
                      overview?.authentication.protectedRoutes ?? [
                        "/api/auth/me",
                        "/api/contacts",
                        "/api/chats",
                        "/api/location/me",
                      ]
                    ).map((route) => (
                      <Badge key={route} tone="neutral">
                        {route}
                      </Badge>
                    ))}
                  </div>
                </SectionCard>
              </div>
            ) : null}

            {activeTab === "logs" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <LogFeed
                  title="Request log stream"
                  description="Recent authenticated or anonymous HTTP calls captured by the backend middleware."
                  entries={requestLogs}
                  emptyMessage="Requests will appear here after you start using the API."
                  unavailable={systemApiMissing}
                />
                <LogFeed
                  title="Error log stream"
                  description="Unhandled runtime errors, exceptions and rejected promises."
                  entries={errorLogs}
                  emptyMessage="No error entries captured yet."
                  unavailable={systemApiMissing}
                />
              </div>
            ) : null}

            {isLoading ? (
              <InlineAlert tone="info" title="Admin panel">
                Loading admin data…
              </InlineAlert>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
