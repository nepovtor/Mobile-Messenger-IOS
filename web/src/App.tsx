import { lazy, Suspense, useEffect } from "react";
import { initializeSessionCoordinator } from "@/app/sessionCoordinator";
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
  const { restoreSession, isAuthenticated: isUserAuthenticated } = authStore();
  const {
    restoreSession: restoreAdminSession,
    isAuthenticated: isAdminAuthenticated,
  } = adminStore();

  useEffect(() => {
    void restoreSession();
    void restoreAdminSession();
    void pushStore
      .getState()
      .initialize()
      .then(() => {
        if (authStore.getState().isAuthenticated) {
          return pushStore.getState().syncForAuthenticatedUser();
        }

        return undefined;
      });
  }, [restoreAdminSession, restoreSession]);

  useEffect(() => {
    if (!isUserAuthenticated) {
      locationStore.getState().clear();
    }
  }, [isUserAuthenticated]);

  useEffect(() => {
    if (isUserAuthenticated) {
      void pushStore.getState().syncForAuthenticatedUser();
    }
  }, [isUserAuthenticated]);

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

  return (
    <Routes>
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
