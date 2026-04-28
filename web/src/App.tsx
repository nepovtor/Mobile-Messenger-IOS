import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { MessengerPage } from "./pages/MessengerPage";
import { authStore } from "./store/authStore";

export default function App() {
  const { restoreSession, isAuthenticated, isLoading } = authStore();

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        Restoring session…
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={isAuthenticated ? <Navigate to="/messenger" replace /> : <LoginPage />}
      />
      <Route
        path="/messenger"
        element={isAuthenticated ? <MessengerPage /> : <Navigate to="/" replace />}
      />
    </Routes>
  );
}
