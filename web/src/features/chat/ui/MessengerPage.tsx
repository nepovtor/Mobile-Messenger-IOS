import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { authStore } from "@/features/auth/model/authStore";
import { chatStore } from "@/features/chat/model/chatStore";
import { realtimeStore } from "@/features/chat/model/realtimeStore";
import type { Message } from "@/features/chat/types/message";
import { logoutUserSession } from "@/app/sessionCoordinator";
import {
  matrixApi,
  type MatrixBackendConfig,
} from "@/features/chat/matrix/matrixApi";

const MatrixWorkspace = lazy(async () => ({
  default: (await import("@/features/chat/matrix/MatrixWorkspace"))
    .MatrixWorkspace,
}));

export function MessengerPage() {
  const [matrixConfig, setMatrixConfig] = useState<
    MatrixBackendConfig | null | undefined
  >();
  const [configOwner, setConfigOwner] = useState<string>();
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, error, clearError, updateDisplayName } =
    authStore();
  const {
    loadChats,
    upsertMessage,
    updateMessage,
    removeMessage,
    markMessageFailed,
    markMessageRead,
    updateTyping,
  } = chatStore();

  const userID = currentUser?.userID;

  useEffect(() => {
    if (!isAuthenticated || !userID) return;
    let active = true;
    void matrixApi
      .config(userID)
      .then((config) => {
        if (active) {
          setMatrixConfig(config);
          setConfigOwner(userID);
          setMatrixError(null);
        }
      })
      .catch(() => {
        if (active)
          setMatrixError(
            "Не удалось проверить настройки защищённой переписки. Обновите страницу",
          );
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, userID]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser) {
      navigate("/", { replace: true });
      return;
    }

    if (matrixConfig !== null || configOwner !== userID) return;

    void loadChats();
    realtimeStore.getState().connect((event) => {
      if (event.event === "message.created") {
        const data = event.data as {
          chatID: string;
          message: Message;
        };
        upsertMessage(data.chatID, {
          ...data.message,
          clientMessageId: data.message.messageID ?? data.message.id,
        });
        void loadChats();
      }

      if (event.event === "message.send.ack") {
        const data = event.data as {
          chatID: string;
          clientMessageId: string;
          message: Message;
        };
        upsertMessage(data.chatID, {
          ...data.message,
          clientMessageId: data.clientMessageId,
          status: "sent",
          error: null,
          isLocal: false,
        });
        void loadChats();
      }

      if (event.event === "message.failed") {
        const data = event.data as {
          chatID: string;
          clientMessageId: string;
          reason: string;
        };
        markMessageFailed(data.chatID, data.clientMessageId, data.reason);
      }

      if (event.event === "message.read") {
        const data = event.data as { chatID: string; messageID: string };
        markMessageRead(data.chatID, data.messageID);
      }

      if (event.event === "message.updated") {
        const data = event.data as { chatID: string; message: Message };
        updateMessage(data.chatID, data.message);
        void loadChats();
      }

      if (event.event === "message.deleted") {
        const data = event.data as { chatID: string; message: Message };
        removeMessage(data.chatID, data.message);
        void loadChats();
      }

      if (
        event.event === "typing.started" ||
        event.event === "typing.stopped"
      ) {
        const data = event.data as {
          chatID: string;
          typingParticipants: string[];
        };
        updateTyping(data.chatID, data.typingParticipants);
      }
    });

    return () => {
      realtimeStore.getState().clear();
    };
  }, [
    currentUser,
    configOwner,
    userID,
    matrixConfig,
    isAuthenticated,
    loadChats,
    markMessageFailed,
    markMessageRead,
    navigate,
    removeMessage,
    updateTyping,
    updateMessage,
    upsertMessage,
  ]);

  useEffect(() => {
    if (error) {
      navigate("/", { replace: true });
      clearError();
    }
  }, [clearError, error, navigate]);

  if (!currentUser) {
    return null;
  }

  if (matrixError)
    return (
      <main className="p-6 text-slate-200">
        <p role="alert">{matrixError}</p>
      </main>
    );
  if (matrixConfig === undefined || configOwner !== userID)
    return (
      <main className="p-6 text-slate-200">Проверяем настройки переписки…</main>
    );
  if (
    matrixConfig &&
    !matrixConfig.expectedUserID.startsWith(
      `@u_${currentUser.userID.replaceAll("-", "").toLowerCase()}:`,
    )
  )
    return (
      <main className="p-6 text-slate-200">Проверяем настройки аккаунта…</main>
    );
  if (matrixConfig)
    return (
      <Suspense
        fallback={
          <main className="p-6 text-slate-200">
            Открываем защищённую переписку…
          </main>
        }
      >
        <MatrixWorkspace
          key={matrixConfig.expectedUserID}
          config={matrixConfig}
          user={currentUser}
        />
      </Suspense>
    );

  return (
    <AppShell
      currentUser={currentUser}
      onLogout={() => void logoutUserSession()}
      onUpdateDisplayName={(displayName) => updateDisplayName(displayName)}
    />
  );
}
