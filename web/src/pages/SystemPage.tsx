import {
  Activity,
  Clock3,
  Code2,
  Database,
  RefreshCcw,
  ScrollText,
  Server,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/httpClient";
import { systemApi } from "../api/systemApi";
import { UserMenu } from "../components/chat/UserMenu";
import { WorkspaceSwitcher } from "../components/layout/WorkspaceSwitcher";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { InlineAlert } from "../components/ui/InlineAlert";
import { authStore } from "../store/authStore";
import { realtimeStore } from "../store/realtimeStore";
import type {
  BackendHealthInfo,
  BackendVersionInfo,
  SystemLogEntry,
  SystemOverview,
} from "../types/system";

type DecodedJwt = {
  sub?: string;
  displayName?: string;
  contact?: string;
  method?: string;
  phone?: string;
  iat?: number;
  exp?: number;
};

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

function formatUptime(seconds: number) {
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

function isMissingSystemRoute(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 404 &&
    /\/api\/system\//i.test(error.message)
  );
}

function formatSessionExpiry(value?: number) {
  return typeof value === "number" ? formatDateTime(value) : "n/a";
}

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

function StatusPill({
  label,
  value,
}: {
  label: string;
  value: boolean | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <span className="text-sm text-slate-300">{label}</span>
      <Badge
        tone={
          value === true ? "success" : value === false ? "warning" : "neutral"
        }
        pulseDot={value !== null}
      >
        {value === true ? "Ready" : value === false ? "Missing" : "Unknown"}
      </Badge>
    </div>
  );
}

function LogFeed({
  title,
  description,
  emptyMessage,
  entries,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  entries: SystemLogEntry[];
}) {
  return (
    <Card className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {description}
            </p>
          </div>
          <Badge tone={entries.length > 0 ? "success" : "neutral"}>
            {entries.length} entries
          </Badge>
        </div>

      {entries.length === 0 ? (
        <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/[0.04] px-4 py-10 text-center text-sm text-slate-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
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
                        {method && url ? (
                          <span className="text-sm font-medium text-white">
                            {method} {url}
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-white">
                            {entry.message}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {formatDateTime(entry.timestamp)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                      {typeof statusCode === "number" ? (
                        <Badge
                          tone={statusCode >= 500 ? "danger" : "neutral"}
                        >
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
    </Card>
  );
}

function LabCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Code2;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="h-full p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-400/10 text-cyan-100">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <div className="mt-3 space-y-3 text-sm leading-6 text-slate-300">
            {children}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function SystemPage() {
  const navigate = useNavigate();
  const {
    currentUser,
    isAuthenticated,
    token,
    error: authError,
    clearError,
    logout,
    updateDisplayName,
  } = authStore();
  const connectionState = realtimeStore((state) => state.connectionState);
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

  useEffect(() => {
    if (!isAuthenticated || !currentUser) {
      navigate("/", { replace: true });
      return;
    }

    let isDisposed = false;

    async function loadSystemData(isManualRefresh = false) {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setPageError(null);
      setSystemApiMissing(false);
      try {
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

        if (isDisposed) {
          return;
        }

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

        if (missingSystemRoutes) {
          setSystemApiMissing(true);
          setPageError(
            "Current backend deployment does not expose /api/system/* yet. Deploy the latest backend build or point the web client to your local backend.",
          );
        } else if (systemErrors[0]) {
          setPageError(
            systemErrors[0] instanceof Error
              ? systemErrors[0].message
              : "Could not load the system overview.",
          );
        }

        if (!missingSystemRoutes && !systemErrors[0]) {
          setPageError(null);
        }
      } finally {
        if (!isDisposed) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void loadSystemData();

    return () => {
      isDisposed = true;
    };
  }, [currentUser, isAuthenticated, navigate]);

  useEffect(() => {
    if (authError) {
      navigate("/", { replace: true });
      clearError();
    }
  }, [authError, clearError, navigate]);

  if (!currentUser) {
    return null;
  }

  async function handleRefresh() {
    setRefreshing(true);
    setPageError(null);
    setSystemApiMissing(false);

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

    if (missingSystemRoutes) {
      setSystemApiMissing(true);
      setPageError(
        "Current backend deployment does not expose /api/system/* yet. Deploy the latest backend build or point the web client to your local backend.",
      );
    } else if (systemErrors[0]) {
      setPageError(
        systemErrors[0] instanceof Error
          ? systemErrors[0].message
          : "Could not refresh the system overview.",
      );
    }

    setRefreshing(false);
  }

  const displayedVersion = overview?.api.version ?? versionInfo?.version ?? "n/a";
  const displayedEnvironment =
    overview?.api.environment ??
    (systemApiMissing ? "Not exposed by current deployment" : "n/a");
  const displayedNodeVersion =
    overview?.api.nodeVersion ??
    (systemApiMissing ? "Not exposed by current deployment" : "n/a");
  const displayedUptime =
    overview?.api.uptimeSeconds ?? healthInfo?.uptime ?? null;
  const displayedGeneratedAt = overview?.generatedAt ?? healthInfo?.timestamp ?? null;
  const displayedTsStrict = overview?.typescript.strict ?? repoFallback.typescript.strict;
  const displayedTsTarget = overview?.typescript.target ?? repoFallback.typescript.target;
  const displayedRequestLogFile =
    overview?.logging.requestFile ?? repoFallback.logging.requestFile;
  const displayedErrorLogFile =
    overview?.logging.errorFile ?? repoFallback.logging.errorFile;
  const displayedJwtConfigured =
    overview?.authentication.jwtConfigured ?? Boolean(token);
  const displayedJwtExpiresIn =
    overview?.authentication.jwtExpiresIn ?? formatSessionExpiry(jwtPayload?.exp);
  const displayedBearerScheme =
    overview?.authentication.bearerScheme ?? "Bearer";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.15),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.14),_transparent_28%),linear-gradient(180deg,#020617_0%,#111827_100%)] px-4 py-4 sm:px-6 sm:py-6">
      <div className="glass-orb left-[-4rem] top-[4rem] h-44 w-44 bg-cyan-400/20" />
      <div className="glass-orb right-[10%] top-[10%] h-60 w-60 bg-amber-400/16" />

      <div className="mx-auto flex max-w-[1480px] flex-col gap-4">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100">
                <Server className="h-3.5 w-3.5" />
                System dashboard
              </p>
              <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                Web demo for labs 7-11
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                A browser-accessible control room for the core coursework
                features: TypeScript runtime metadata, request and error logs,
                Docker assets, PostgreSQL + TypeORM status, and JWT-based
                authentication.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  API
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {displayedVersion}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  JWT
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {token ? "Active" : "Missing"}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  DB rows
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {overview
                    ? overview.database.counts.users +
                      overview.database.counts.contacts +
                      overview.database.counts.chats +
                      overview.database.counts.messages
                    : systemApiMissing
                      ? "unavailable"
                      : "loading"}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  Logs
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {requestLogs.length + errorLogs.length} loaded
                </p>
              </Card>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-[32px] border border-white/10 bg-slate-950/40 p-4 backdrop-blur-2xl">
            <div className="space-y-4">
              <WorkspaceSwitcher />
              <UserMenu
                user={currentUser}
                connectionState={connectionState}
                onUpdateDisplayName={updateDisplayName}
                onLogout={logout}
              />

              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Refresh overview
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Reloads backend status, counts, request logs and error
                      logs.
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
                  Session snapshot
                </p>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Token preview
                    </p>
                    <p className="mt-2 break-all font-medium text-white">
                      {token
                        ? `${token.slice(0, 18)}...${token.slice(-12)}`
                        : "No token"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      JWT expiry
                    </p>
                    <p className="mt-2 font-medium text-white">
                      {formatDateTime(jwtPayload?.exp ?? null)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Subject
                    </p>
                    <p className="mt-2 break-all font-medium text-white">
                      {jwtPayload?.sub ?? currentUser.userID}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </aside>

          <main className="space-y-4">
            {pageError ? (
              <InlineAlert tone="danger" title="System dashboard">
                {pageError}
              </InlineAlert>
            ) : null}

            {systemApiMissing ? (
              <InlineAlert tone="warning" title="Live backend note">
                The current Railway deployment is missing the new protected
                `/api/system/*` routes. Repo-backed sections below still show
                known project setup, but live logs and database counts require a
                backend redeploy.
              </InlineAlert>
            ) : null}

            <InlineAlert tone="info" title="What this page covers">
              The page exposes the main backend-focused coursework features in
              the browser: strict TypeScript setup, log files, Docker assets,
              PostgreSQL + TypeORM persistence, and JWT/Bearer authentication.
            </InlineAlert>

            <div className="grid gap-4 2xl:grid-cols-2">
              <LabCard icon={Code2} title="Lab 7. TypeScript">
                <p>
                  The web client runs on React + Vite + TypeScript, while the
                  backend reports its active compiler target, module mode and
                  strict-mode flag directly from `tsconfig.json`.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="success">Frontend TS</Badge>
                  <Badge
                    tone={displayedTsStrict ? "success" : "warning"}
                  >
                    Strict: {String(displayedTsStrict)}
                  </Badge>
                  <Badge tone="neutral">
                    Target: {String(displayedTsTarget)}
                  </Badge>
                </div>
              </LabCard>

              <LabCard icon={ScrollText} title="Lab 8. Logging & Error Handling">
                <p>
                  Every HTTP request is logged with method, URL, query, body,
                  status code and duration. Runtime errors, uncaught exceptions
                  and unhandled promise rejections are written into a dedicated
                  error log file.
                </p>
                <div className="space-y-2">
                  <StatusPill
                    label={`Request log: ${tailPath(displayedRequestLogFile)}`}
                    value={overview ? Boolean(overview.logging.requestFile) : null}
                  />
                  <StatusPill
                    label={`Error log: ${tailPath(displayedErrorLogFile)}`}
                    value={overview ? Boolean(overview.logging.errorFile) : null}
                  />
                </div>
                {systemApiMissing ? (
                  <p className="text-xs leading-5 text-slate-400">
                    Log file names are configured in the repo, but live log
                    streaming is unavailable on the current deployment.
                  </p>
                ) : null}
              </LabCard>

              <LabCard icon={Server} title="Lab 9. Docker Basics">
                <p>
                  The backend publishes whether the repository contains the
                  server Dockerfile, the root deployment Dockerfile and the
                  compose setup used for local infrastructure.
                </p>
                <div className="space-y-2">
                  <StatusPill
                    label="Root Dockerfile"
                    value={
                      overview?.docker.rootDockerfilePresent ??
                      repoFallback.docker.rootDockerfilePresent
                    }
                  />
                  <StatusPill
                    label="Server Dockerfile"
                    value={
                      overview?.docker.serverDockerfilePresent ??
                      repoFallback.docker.serverDockerfilePresent
                    }
                  />
                  <StatusPill
                    label="docker-compose"
                    value={
                      overview?.docker.composeFilePresent ??
                      repoFallback.docker.composeFilePresent
                    }
                  />
                </div>
              </LabCard>

              <LabCard
                icon={Database}
                title="Lab 10. PostgreSQL & TypeORM"
              >
                <p>
                  PostgreSQL is the active backend store, TypeORM manages the
                  entities, and the dashboard shows current data volume across
                  users, contacts, chats, messages and shared locations.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <StatusPill
                    label={`${overview?.database.driver ?? repoFallback.database.driver} / ${
                      overview?.database.orm ?? repoFallback.database.orm
                    }`}
                    value={true}
                  />
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <span className="text-sm text-slate-300">
                      Synchronize:{" "}
                      {overview
                        ? overview.database.synchronize
                          ? "on"
                          : "off"
                        : "n/a"}
                    </span>
                    <Badge
                      tone={
                        overview
                          ? overview.database.synchronize
                            ? "warning"
                            : "success"
                          : "neutral"
                      }
                    >
                      {overview
                        ? overview.database.synchronize
                          ? "Dev mode"
                          : "Safe"
                        : "Unknown"}
                    </Badge>
                  </div>
                </div>
                {systemApiMissing ? (
                  <p className="text-xs leading-5 text-slate-400">
                    Driver and ORM are known from the repo. Live row counts need
                    the latest backend deployment.
                  </p>
                ) : null}
              </LabCard>

              <LabCard
                icon={ShieldCheck}
                title="Lab 11. Authentication & JWT"
              >
                <p>
                  This browser session uses Bearer authentication, stores the
                  JWT locally, decodes the payload in the UI and calls protected
                  backend routes with the token in the `Authorization` header.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    tone={displayedJwtConfigured ? "success" : "danger"}
                  >
                    JWT secret {displayedJwtConfigured ? "configured" : "missing"}
                  </Badge>
                  <Badge tone="neutral">
                    Scheme: {displayedBearerScheme}
                  </Badge>
                  <Badge tone="neutral">
                    Expires: {displayedJwtExpiresIn}
                  </Badge>
                </div>
              </LabCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white">
                      Runtime summary
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Live backend metadata pulled from the protected system API.
                    </p>
                  </div>
                  <Activity className="h-5 w-5 text-cyan-200" />
                </div>

                {isLoading && !overview ? (
                  <div className="mt-5 text-sm text-slate-400">
                    Loading system overview…
                  </div>
                ) : overview ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
                        {displayedUptime != null
                          ? formatUptime(displayedUptime)
                          : "n/a"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Generated
                      </p>
                      <p className="mt-2 font-semibold text-white">
                        {formatDateTime(displayedGeneratedAt)}
                      </p>
                    </div>
                  </div>
                ) : null}
              </Card>

              <Card className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white">
                      Data snapshot
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Current counts from PostgreSQL through TypeORM.
                    </p>
                  </div>
                  <Clock3 className="h-5 w-5 text-amber-200" />
                </div>

                {overview ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Object.entries(overview.database.counts).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
                        >
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            {key}
                          </p>
                          <p className="mt-2 text-xl font-semibold text-white">
                            {value}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="mt-5 text-sm text-slate-400">
                    {systemApiMissing
                      ? "Database counts are unavailable on the current deployment."
                      : "Loading database counts…"}
                  </div>
                )}
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <LogFeed
                title="Recent request logs"
                description="Incoming API requests captured with URL, query, body, status code and duration."
                emptyMessage="Requests will appear here after you use the API."
                entries={requestLogs}
              />
              <LogFeed
                title="Recent error logs"
                description="Runtime failures, uncaught exceptions and rejected promises are collected in the dedicated error stream."
                emptyMessage="No error entries captured yet."
                entries={errorLogs}
              />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
