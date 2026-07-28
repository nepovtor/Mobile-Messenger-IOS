import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { chatApi } from "@/features/chat/api/chatApi";
import { contactsApi } from "@/features/contacts/api/contactsApi";
import { ConnectionBadge } from "@/features/chat/ui/ConnectionBadge";
import { chatStore } from "@/features/chat/model/chatStore";
import { realtimeStore } from "@/features/chat/model/realtimeStore";
import { toastStore } from "@/shared/model/toastStore";
import type { CurrentUser } from "@/features/auth/types/auth";
import type { ContactEntry } from "@/features/contacts/types/contact";
import { mapContactErrorMessage, validateContactPhone } from "@/utils/contacts";
import { ChatPanel } from "@/components/layout/ChatPanel";
import { Sidebar } from "@/components/layout/Sidebar";

export function AppShell({
  currentUser,
  onLogout,
  onUpdateDisplayName,
}: {
  currentUser: CurrentUser;
  onLogout: () => void;
  onUpdateDisplayName: (displayName: string) => Promise<void>;
}) {
  const {
    chats,
    selectedChatId,
    messagesByChatId,
    isLoadingChats,
    isLoadingMessages,
    selectChat,
    loadChats,
    loadMessages,
    error: chatError,
    clearError: clearChatError,
    sendMessage,
    retryMessage,
    editMessage,
    deleteMessage,
  } = chatStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const connectionState = realtimeStore((state) => state.connectionState);
  const realtimeError = realtimeStore((state) => state.lastError);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [isLoadingContacts, setLoadingContacts] = useState(false);
  const [isAddingContact, setAddingContact] = useState(false);
  const [openingContactId, setOpeningContactId] = useState<string | null>(null);
  const [removingContactId, setRemovingContactId] = useState<string | null>(
    null,
  );
  const lastRealtimeToastKeyRef = useRef<string | null>(null);
  const pendingUrlSyncChatIdRef = useRef<string | null>(null);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );
  const chatIdFromUrl = searchParams.get("chatId");

  useEffect(() => {
    let isCancelled = false;

    setContacts([]);
    setLoadingContacts(true);

    void contactsApi
      .getContacts()
      .then((result) => {
        if (isCancelled) {
          return;
        }

        setContacts(result);
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        toastStore.getState().showToast({
          tone: "danger",
          title: "Контакты",
          message: mapContactErrorMessage(
            error,
            "Не удалось загрузить контакты.",
          ),
          dedupeKey: "contacts-load-error",
        });
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingContacts(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [currentUser.userID]);

  useEffect(() => {
    if (selectedChatId && !messagesByChatId[selectedChatId]) {
      void loadMessages(selectedChatId);
    }
  }, [loadMessages, messagesByChatId, selectedChatId]);

  useEffect(() => {
    if (!chatError) {
      return;
    }

    toastStore.getState().showToast({
      tone: "danger",
      title: "Чаты",
      message: chatError,
      dedupeKey: `chat-error:${chatError}`,
    });
    clearChatError();
  }, [chatError, clearChatError]);

  useEffect(() => {
    if (connectionState === "connected") {
      lastRealtimeToastKeyRef.current = null;
      return;
    }

    const message =
      realtimeError ??
      (connectionState === "failed"
        ? "Соединение с realtime недоступно."
        : connectionState === "disconnected"
          ? "Realtime-соединение разорвано."
          : null);

    if (!message) {
      return;
    }

    const dedupeKey = `realtime:${connectionState}:${message}`;
    if (lastRealtimeToastKeyRef.current === dedupeKey) {
      return;
    }

    lastRealtimeToastKeyRef.current = dedupeKey;
    toastStore.getState().showToast({
      tone: connectionState === "failed" ? "danger" : "warning",
      title: "Realtime",
      message,
      dedupeKey,
    });
  }, [connectionState, realtimeError]);

  useEffect(() => {
    if (!chatIdFromUrl) {
      return;
    }

    if (
      pendingUrlSyncChatIdRef.current === selectedChatId &&
      selectedChatId !== null &&
      chatIdFromUrl !== selectedChatId
    ) {
      return;
    }

    if (selectedChatId === chatIdFromUrl) {
      if (pendingUrlSyncChatIdRef.current === selectedChatId) {
        pendingUrlSyncChatIdRef.current = null;
      }
      return;
    }

    if (!chats.some((chat) => chat.id === chatIdFromUrl)) {
      return;
    }

    selectChat(chatIdFromUrl);
    setSidebarOpen(false);
  }, [chatIdFromUrl, chats, selectChat, selectedChatId]);

  useEffect(() => {
    const currentChatId = searchParams.get("chatId");

    if (selectedChatId && currentChatId !== selectedChatId) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("chatId", selectedChatId);
      setSearchParams(nextParams, { replace: true });
      return;
    }

    if (
      selectedChatId &&
      currentChatId === selectedChatId &&
      pendingUrlSyncChatIdRef.current === selectedChatId
    ) {
      pendingUrlSyncChatIdRef.current = null;
    }
  }, [searchParams, selectedChatId, setSearchParams]);

  useEffect(() => {
    if (!selectedChat) {
      setSidebarOpen(true);
      return;
    }

    const messages = messagesByChatId[selectedChat.id] ?? [];
    const latestIncoming = [...messages]
      .reverse()
      .find((message) => message.authorID !== currentUser.userID);

    if (!latestIncoming || latestIncoming.status === "read") {
      return;
    }

    try {
      realtimeStore.getState().sendEvent("message.read", {
        chatID: selectedChat.id,
        messageID: latestIncoming.id,
      });
    } catch {
      void chatApi.markRead(selectedChat.id, latestIncoming.id);
    }
  }, [currentUser.userID, messagesByChatId, selectedChat]);

  async function handleAddContact(phone: string) {
    const validationMessage = validateContactPhone(phone);
    if (validationMessage) {
      toastStore.getState().showToast({
        tone: "warning",
        title: "Контакты",
        message: validationMessage,
      });
      return false;
    }

    setAddingContact(true);
    try {
      const result = await contactsApi.addContact(phone);
      setContacts((existing) => {
        const withoutDuplicate = existing.filter(
          (item) => item.id !== result.id,
        );
        return [result, ...withoutDuplicate];
      });
      toastStore.getState().showToast({
        tone: result.alreadyExists ? "info" : "success",
        title: "Контакты",
        message: result.alreadyExists ? "Контакт уже есть" : "Контакт добавлен",
      });
      return true;
    } catch (error: unknown) {
      toastStore.getState().showToast({
        tone: "danger",
        title: "Контакты",
        message: mapContactErrorMessage(error, "Не удалось добавить контакт."),
      });
      return false;
    } finally {
      setAddingContact(false);
    }
  }

  async function handleRemoveContact(contact: ContactEntry) {
    setRemovingContactId(contact.id);
    try {
      await contactsApi.removeContact(contact.id);
      setContacts((existing) =>
        existing.filter((item) => item.id !== contact.id),
      );
      toastStore.getState().showToast({
        tone: "success",
        title: "Контакты",
        message: "Контакт удалён",
      });
      return true;
    } catch (error: unknown) {
      toastStore.getState().showToast({
        tone: "danger",
        title: "Контакты",
        message: mapContactErrorMessage(error, "Не удалось удалить контакт."),
      });
      return false;
    } finally {
      setRemovingContactId(null);
    }
  }

  async function handleOpenContact(contact: ContactEntry) {
    setOpeningContactId(contact.id);
    try {
      const existingDirectChat = contact.directChatID
        ? chats.find((item) => item.id === contact.directChatID)
        : null;
      const chat =
        existingDirectChat ??
        (await chatApi.createChat(contact.displayName, [contact.phone]));
      await loadChats();
      pendingUrlSyncChatIdRef.current = chat.id;
      selectChat(chat.id);
      setSidebarOpen(false);
      return true;
    } catch (error: unknown) {
      toastStore.getState().showToast({
        tone: "danger",
        title: "Чаты",
        message: mapContactErrorMessage(error, "Не удалось открыть чат."),
      });
      return false;
    } finally {
      setOpeningContactId(null);
    }
  }

  return (
    <div className="app-page app-page--workspace px-0 py-0 sm:px-3 sm:py-3">
      <div className="glass-orb left-[3%] top-[8%] h-40 w-40 bg-sky-400/18" />
      <div className="glass-orb right-[6%] top-[12%] h-52 w-52 bg-cyan-300/12" />

      <div className="app-workspace-frame relative z-10 mx-auto max-w-[1600px]">
        <div className="app-shell app-workspace-shell flex h-full overflow-hidden border-white/8">
          <div
            className={clsx(
              "min-h-0 w-full flex-col md:flex md:w-[380px] md:shrink-0 md:border-r md:border-white/8",
              isSidebarOpen ? "flex" : "hidden md:flex",
            )}
          >
            <Sidebar
              user={currentUser}
              chats={chats}
              contacts={contacts}
              selectedChatId={selectedChatId}
              isLoading={isLoadingChats}
              isLoadingContacts={isLoadingContacts}
              connectionState={connectionState}
              isAddingContact={isAddingContact}
              openingContactId={openingContactId}
              removingContactId={removingContactId}
              onSelectChat={(chatId) => {
                pendingUrlSyncChatIdRef.current = chatId;
                selectChat(chatId);
                setSidebarOpen(false);
              }}
              onOpenContact={handleOpenContact}
              onAddContact={handleAddContact}
              onRemoveContact={handleRemoveContact}
              onUpdateDisplayName={onUpdateDisplayName}
              onLogout={onLogout}
            />
          </div>

          <div
            className={clsx(
              "min-h-0 flex-1 flex-col md:flex",
              selectedChat ? "flex" : "hidden md:flex",
            )}
          >
            {selectedChat ? (
              <ChatPanel
                chat={selectedChat}
                messages={messagesByChatId[selectedChat.id] ?? []}
                currentUser={currentUser}
                connectionState={connectionState}
                connectionIndicator={
                  <ConnectionBadge state={connectionState} />
                }
                isLoadingMessages={isLoadingMessages}
                onBack={() => setSidebarOpen(true)}
                onReconnect={() => realtimeStore.getState().reconnect()}
                onSend={(text) =>
                  sendMessage(selectedChat.id, text, currentUser)
                }
                onRetry={(clientMessageId) =>
                  void retryMessage(
                    selectedChat.id,
                    clientMessageId,
                    currentUser,
                  )
                }
                onEditMessage={(messageId, text) =>
                  editMessage(selectedChat.id, messageId, text)
                }
                onDeleteMessage={(messageId) =>
                  deleteMessage(selectedChat.id, messageId)
                }
                onTypingStart={() => {
                  try {
                    realtimeStore.getState().sendEvent("typing.started", {
                      chatID: selectedChat.id,
                    });
                  } catch {
                    void 0;
                  }
                }}
                onTypingStop={() => {
                  try {
                    realtimeStore.getState().sendEvent("typing.stopped", {
                      chatID: selectedChat.id,
                    });
                  } catch {
                    void 0;
                  }
                }}
              />
            ) : (
              <div className="messenger-chat flex h-full flex-1 items-center justify-center px-6">
                <div className="max-w-xs text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-cyan-200/12 bg-cyan-300/[0.06] text-cyan-100 shadow-[0_18px_40px_rgba(5,12,24,0.24)]">
                    <span className="text-2xl">✦</span>
                  </div>
                  <h2 className="mt-5 text-lg font-semibold text-white">
                    Выберите чат
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Откройте существующий диалог или начните новый из контактов
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
