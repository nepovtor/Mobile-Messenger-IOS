import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Card } from "./components/ui/Card";
import { Spinner } from "./components/ui/Spinner";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { LoginPage } from "./pages/LoginPage";
import { MapPage } from "./pages/MapPage";
import { MessengerPage } from "./pages/MessengerPage";
import { SystemPage } from "./pages/SystemPage";
import { TelegramSubscriptionPage } from "./pages/TelegramSubscriptionPage";
import { adminStore } from "./store/adminStore";
import { authStore } from "./store/authStore";
import { locationStore } from "./store/locationStore";

export default function App() {
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
  }, [restoreAdminSession, restoreSession]);

  useEffect(() => {
    if (!isUserAuthenticated) {
      locationStore.getState().clear();
    }
  }, [isUserAuthenticated]);

  if (isUserLoading || isAdminLoading) {
    return (
      <div className="app-page app-page--workspace flex items-center justify-center px-4 text-slate-200">
        <div className="app-grid-fade" />
        <Card className="app-shell relative z-10 flex items-center gap-3 px-5 py-4">
          <Spinner />
          Восстанавливаем сессии…
        </Card>
      </div>
    );
  }

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
  );
}
