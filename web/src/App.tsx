import { lazy, Suspense, useEffect, useState } from "react";
import {
  logoutUserSession,
  initializeSessionCoordinator,
} from "@/app/sessionCoordinator";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { LoginPage } from "@/features/auth/ui/LoginPage";
import { MessengerPage } from "@/features/chat/ui/MessengerPage";
import { adminStore } from "@/features/admin/model/adminStore";
import { authStore } from "@/features/auth/model/authStore";
import { locationStore } from "@/features/location/model/locationStore";
import { pushStore } from "@/features/push/model/pushStore";

const AdminLoginPage = lazy(async () => ({
  default: (await import("@/features/admin/ui/AdminLoginPage")).AdminLoginPage,
}));

const MatrixCallbackPage = lazy(async () => ({
  default: (await import("@/features/chat/matrix/MatrixCallbackPage"))
    .MatrixCallbackPage,
}));

const MapPage = lazy(async () => ({
  default: (await import("@/features/location/ui/MapPage")).MapPage,
}));

const SystemPage = lazy(async () => ({
  default: (await import("@/features/admin/ui/SystemPage")).SystemPage,
}));

const TelegramSubscriptionPage = lazy(async () => ({
  default: (await import("@/features/auth/ui/TelegramSubscriptionPage"))
    .TelegramSubscriptionPage,
}));

initializeSessionCoordinator();

function RouteFallback() {
  return (
    <div className="app-page app-page--workspace flex items-center justify-center px-4 text-slate-200">
      <div className="app-grid-fade" />
      <Card className="app-shell relative z-10 flex items-center gap-3 px-5 py-4">
        <Spinner />
        Загружаем экран…
      </Card>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const [sessionsRestored, setSessionsRestored] = useState(false);
  const [pushInitialized, setPushInitialized] = useState(false);
  const {
    restoreSession,
    isAuthenticated: isUserAuthenticated,
    logoutPending,
    logoutError,
  } = authStore();
  const [logoutBusy, setLogoutBusy] = useState(false);
  const {
    restoreSession: restoreAdminSession,
    isAuthenticated: isAdminAuthenticated,
  } = adminStore();

  useEffect(() => {
    let isDisposed = false;

    async function initializeSessions() {
      await Promise.allSettled([restoreSession(), restoreAdminSession()]);
      if (!isDisposed) {
        setSessionsRestored(true);
      }
    }

    void initializeSessions();
    void pushStore
      .getState()
      .initialize()
      .catch(() => undefined)
      .finally(() => {
        if (!isDisposed) {
          setPushInitialized(true);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [restoreAdminSession, restoreSession]);

  useEffect(() => {
    if (sessionsRestored && !isUserAuthenticated) {
      locationStore.getState().clear();
    }
  }, [isUserAuthenticated, sessionsRestored]);

  useEffect(() => {
    if (
      sessionsRestored &&
      pushInitialized &&
      isUserAuthenticated &&
      !logoutPending
    ) {
      void pushStore.getState().syncForAuthenticatedUser();
    }
  }, [isUserAuthenticated, pushInitialized, sessionsRestored, logoutPending]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (
        typeof event.data !== "object" ||
        event.data === null ||
        event.data.type !== "push.navigate" ||
        typeof event.data.url !== "string"
      ) {
        return;
      }

      navigate(event.data.url);
    };

    navigator.serviceWorker.addEventListener(
      "message",
      handleServiceWorkerMessage,
    );

    return () => {
      navigator.serviceWorker.removeEventListener(
        "message",
        handleServiceWorkerMessage,
      );
    };
  }, [navigate]);

  if (!sessionsRestored) {
    return <RouteFallback />;
  }

  if (logoutPending) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 p-6">
        <h1 className="text-xl font-medium">Выход не завершён</h1>
        <p role="status">
          {logoutError ??
            "Ожидаем подтверждения отзыва сессии от сервера. Переписка заблокирована."}
        </p>
        <button
          disabled={logoutBusy}
          onClick={() => {
            setLogoutBusy(true);
            void logoutUserSession().finally(() => setLogoutBusy(false));
          }}
        >
          {logoutBusy ? "Проверяем…" : "Повторить выход"}
        </button>
      </main>
    );
  }

  return (
    <Routes>
      <Route
        path="/matrix/callback"
        element={
          <Suspense fallback={<RouteFallback />}>
            <MatrixCallbackPage />
          </Suspense>
        }
      />
      <Route
        path="/"
        element={
          isUserAuthenticated ? (
            <Navigate to="/messenger" replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/messenger"
        element={
          isUserAuthenticated ? <MessengerPage /> : <Navigate to="/" replace />
        }
      />
      <Route
        path="/map"
        element={
          isUserAuthenticated ? (
            <Suspense fallback={<RouteFallback />}>
              <MapPage />
            </Suspense>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/telegram/subscription"
        element={
          <Suspense fallback={<RouteFallback />}>
            <TelegramSubscriptionPage />
          </Suspense>
        }
      />
      <Route
        path="/admin/login"
        element={
          isAdminAuthenticated ? (
            <Navigate to="/admin" replace />
          ) : (
            <Suspense fallback={<RouteFallback />}>
              <AdminLoginPage />
            </Suspense>
          )
        }
      />
      <Route
        path="/admin"
        element={
          isAdminAuthenticated ? (
            <Suspense fallback={<RouteFallback />}>
              <SystemPage />
            </Suspense>
          ) : (
            <Navigate to="/admin/login" replace />
          )
        }
      />
      <Route path="/system" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
