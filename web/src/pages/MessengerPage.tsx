import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { authStore } from "../store/authStore";
import { chatStore } from "../store/chatStore";
import { realtimeStore } from "../store/realtimeStore";
import type { Message } from "../types/message";

export function MessengerPage() {
  const navigate = useNavigate();
  const {
    currentUser,
    token,
    isAuthenticated,
    logout,
    error,
    clearError,
    updateDisplayName,
  } = authStore();
  const {
    loadChats,
    upsertMessage,
    updateMessage,
    removeMessage,
    markMessageFailed,
    markMessageRead,
    updateTyping,
  } = chatStore();

  useEffect(() => {
    if (!isAuthenticated || !token || !currentUser) {
      navigate("/", { replace: true });
      return;
    }

    void loadChats();
    realtimeStore.getState().connect(token, (event) => {
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
    isAuthenticated,
    loadChats,
    logout,
    markMessageFailed,
    markMessageRead,
    navigate,
    removeMessage,
    token,
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

  return (
    <AppShell
      currentUser={currentUser}
      onLogout={() => logout()}
      onUpdateDisplayName={(displayName) => updateDisplayName(displayName)}
    />
  );
}
