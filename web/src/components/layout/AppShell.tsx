import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { chatApi } from "../../api/chatApi";
import { contactsApi } from "../../api/contactsApi";
import { realtimeStore } from "../../store/realtimeStore";
import { chatStore } from "../../store/chatStore";
import type { CurrentUser } from "../../types/auth";
import type { ContactEntry } from "../../types/contact";
import {
  mapContactErrorMessage,
  validateContactPhone,
} from "../../utils/contacts";
import { ChatPanel } from "./ChatPanel";
import { Sidebar } from "./Sidebar";

type TransportNotice = {
  tone: "warning" | "danger";
  message: string;
};

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
    sendMessage,
    retryMessage,
    editMessage,
    deleteMessage,
  } = chatStore();
  const connectionState = realtimeStore((state) => state.connectionState);
  const realtimeError = realtimeStore((state) => state.lastError);
  const chatError = chatStore((state) => state.error);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactsNotice, setContactsNotice] = useState<string | null>(null);
  const [isLoadingContacts, setLoadingContacts] = useState(false);
  const [isAddingContact, setAddingContact] = useState(false);
  const [openingContactId, setOpeningContactId] = useState<string | null>(null);
  const [removingContactId, setRemovingContactId] = useState<string | null>(
    null,
  );

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const transportNotice = useMemo<TransportNotice | null>(() => {
    if (chatError) {
      return {
        tone: "danger",
        message: chatError,
      };
    }

    if (realtimeError) {
      return {
        tone: "danger",
        message: realtimeError,
      };
    }

    if (connectionState === "reconnecting") {
      return {
        tone: "warning",
        message: "Соединение восстанавливается",
      };
    }

    if (connectionState === "disconnected") {
      return {
        tone: "warning",
        message: "Нет соединения",
      };
    }

    if (connectionState === "failed") {
      return {
        tone: "danger",
        message: "Соединение недоступно",
      };
    }

    return null;
  }, [chatError, connectionState, realtimeError]);

  useEffect(() => {
    let isCancelled = false;
    setContacts([]);
    setContactsError(null);
    setContactsNotice(null);
    setLoadingContacts(true);

    void contactsApi
      .getContacts()
      .then((result) => {
        if (isCancelled) {
          return;
        }
        setContacts(result);
        setContactsError(null);
        setContactsNotice(null);
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }
        setContactsError(
          mapContactErrorMessage(error, "Не удалось загрузить контакты."),
        );
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
      setContactsNotice(null);
      setContactsError(validationMessage);
      return false;
    }

    setAddingContact(true);
    setContactsNotice(null);
    try {
      const result = await contactsApi.addContact(phone);
      setContacts((existing) => {
        const withoutDuplicate = existing.filter(
          (item) => item.id !== result.id,
        );
        return [result, ...withoutDuplicate];
      });
      setContactsError(null);
      setContactsNotice(
        result.alreadyExists ? "Контакт уже есть" : "Контакт добавлен",
      );
      return true;
    } catch (error: unknown) {
      setContactsError(
        mapContactErrorMessage(error, "Не удалось добавить контакт."),
      );
      return false;
    } finally {
      setAddingContact(false);
    }
  }

  async function handleRemoveContact(contact: ContactEntry) {
    setRemovingContactId(contact.id);
    setContactsNotice(null);
    try {
      await contactsApi.removeContact(contact.id);
      setContacts((existing) =>
        existing.filter((item) => item.id !== contact.id),
      );
      setContactsError(null);
      setContactsNotice("Контакт удалён");
      return true;
    } catch (error: unknown) {
      setContactsError(
        mapContactErrorMessage(error, "Не удалось удалить контакт."),
      );
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
      selectChat(chat.id);
      setSidebarOpen(false);
      return true;
    } catch (error: unknown) {
      setContactsError(
        mapContactErrorMessage(error, "Не удалось открыть чат."),
      );
      return false;
    } finally {
      setOpeningContactId(null);
    }
  }

  return (
    <div className="app-page app-page--workspace px-0 py-0 sm:px-3 sm:py-3">
      <div className="glass-orb left-[3%] top-[8%] h-40 w-40 bg-sky-400/18" />
      <div className="glass-orb right-[6%] top-[12%] h-52 w-52 bg-cyan-300/12" />

      <div className="relative z-10 mx-auto h-screen max-w-[1600px] sm:h-[calc(100vh-1.5rem)]">
        <div className="app-shell flex h-full overflow-hidden rounded-none border-white/8 sm:rounded-[28px]">
          <div
            className={clsx(
              "min-h-0 w-full flex-col md:flex md:w-[360px] md:shrink-0 md:border-r md:border-white/8",
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
              contactsError={contactsError}
              contactsNotice={contactsNotice}
              isAddingContact={isAddingContact}
              openingContactId={openingContactId}
              removingContactId={removingContactId}
              onSelectChat={(chatId) => {
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
                statusNotice={transportNotice}
                isLoadingMessages={isLoadingMessages}
                onBack={() => setSidebarOpen(true)}
                onReconnect={() => realtimeStore.getState().reconnect()}
                onSend={(text) => sendMessage(selectedChat.id, text, currentUser)}
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
              <div className="flex h-full flex-1 items-center justify-center px-6">
                <div className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.04] text-cyan-100 shadow-[0_18px_40px_rgba(5,12,24,0.24)]">
                    <span className="text-xl">+</span>
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-white">
                    Выберите чат
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Откройте диалог слева
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
