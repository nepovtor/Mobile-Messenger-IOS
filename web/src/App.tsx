import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Card } from "./components/ui/Card";
import { Spinner } from "./components/ui/Spinner";
import { ToastViewport } from "./components/ui/ToastViewport";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { LoginPage } from "./pages/LoginPage";
import { MapPage } from "./pages/MapPage";
import { MessengerPage } from "./pages/MessengerPage";
import { SystemPage } from "./pages/SystemPage";
import { TelegramSubscriptionPage } from "./pages/TelegramSubscriptionPage";
import { adminStore } from "./store/adminStore";
import { authStore } from "./store/authStore";
import { locationStore } from "./store/locationStore";
import { pushStore } from "./store/pushStore";

export default function App() {
  const navigate = useNavigate();
  const {
    restoreSession,
    isAuthenticated: isUserAuthenticated,
    isLoading: isUserLoading,
  } = authStore();
  const {
    restoreSession: restoreAdminSession,
    isAuthenticated: isAdminAuthenticated,
    isLoading: isAdminLoading,
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

  if (isUserLoading || isAdminLoading) {
    return (
      <>
        <ToastViewport />
        <div className="app-page app-page--workspace flex items-center justify-center px-4 text-slate-200">
          <div className="app-grid-fade" />
          <Card className="app-shell relative z-10 flex items-center gap-3 px-5 py-4">
            <Spinner />
            Восстанавливаем сессии…
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <ToastViewport />
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
            isUserAuthenticated ? <MapPage /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/telegram/subscription"
          element={<TelegramSubscriptionPage />}
        />
        <Route
          path="/admin/login"
          element={
            isAdminAuthenticated ? (
              <Navigate to="/admin" replace />
            ) : (
              <AdminLoginPage />
            )
          }
        />
        <Route
          path="/admin"
          element={
            isAdminAuthenticated ? (
              <SystemPage />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route path="/system" element={<Navigate to="/admin" replace />} />
      </Routes>
    </>
  );
}
