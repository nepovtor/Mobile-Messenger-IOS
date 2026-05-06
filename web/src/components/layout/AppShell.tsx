import { AnimatePresence, motion } from "framer-motion";
import { Menu, Radio } from "lucide-react";
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
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { InlineAlert } from "../ui/InlineAlert";
import { ChatPanel } from "./ChatPanel";
import { EmptyState } from "./EmptyState";
import { Sidebar } from "./Sidebar";

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
  const [isSidebarOpen, setSidebarOpen] = useState(false);
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

  const unreadCount = useMemo(
    () => chats.reduce((total, chat) => total + chat.unreadCount, 0),
    [chats],
  );

  const statusBanner = useMemo(() => {
    if (chatError) {
      return {
        tone: "danger" as const,
        title: "Ошибка чата",
        message: chatError,
      };
    }

    if (realtimeError) {
      return {
        tone: "danger" as const,
        title: "Состояние realtime",
        message: realtimeError,
      };
    }

    if (connectionState === "reconnecting") {
      return {
        tone: "warning" as const,
        title: "Состояние realtime",
        message:
          "Соединение восстанавливается. История сообщений остаётся на экране, пока сокет переподключается.",
      };
    }

    if (connectionState === "disconnected") {
      return {
        tone: "warning" as const,
        title: "Состояние realtime",
        message:
          "Live-обновления временно недоступны. Можно продолжать читать историю и переподключиться вручную.",
      };
    }

    if (connectionState === "failed") {
      return {
        tone: "danger" as const,
        title: "Состояние realtime",
        message: "Обнаружена проблема с соединением. Переподключите сокет.",
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
          mapContactErrorMessage(error, "Could not load contacts."),
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
      return;
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
        result.alreadyExists
          ? "Контакт уже есть в списке."
          : "Контакт добавлен.",
      );
    } catch (error: unknown) {
      setContactsError(mapContactErrorMessage(error, "Could not add contact."));
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
      setContactsNotice("Контакт удалён.");
    } catch (error: unknown) {
      setContactsError(
        mapContactErrorMessage(error, "Could not remove contact."),
      );
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
    } catch (error: unknown) {
      setContactsError(
        mapContactErrorMessage(error, "Could not open direct chat."),
      );
    } finally {
      setOpeningContactId(null);
    }
  }

  return (
    <div className="app-page app-page--workspace px-4 py-4 sm:px-6 sm:py-6">
      <div className="app-grid-fade" />
      <div className="glass-orb left-[-4rem] top-[4rem] h-44 w-44 bg-cyan-400/22" />
      <div className="glass-orb right-[10%] top-[10%] h-60 w-60 bg-amber-400/14" />

      <div className="relative z-10 mx-auto flex h-[calc(100vh-2rem)] max-w-[1480px] flex-col gap-4 sm:h-[calc(100vh-3rem)]">
        <header className="app-shell rounded-[34px] p-4 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="app-kicker">
                <Radio className="h-3.5 w-3.5" />
                Live workspace
              </div>
              <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
                Mobile Messenger
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                {selectedChat
                  ? `Сейчас открыт диалог «${selectedChat.title}». Можно продолжать переписку, видеть realtime-обновления и переключаться между зонами без потери контекста.`
                  : "Выберите диалог, чтобы продолжить переписку, открыть контакты или перейти к карте. Весь веб-клиент теперь работает как единое пространство."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="p-4">
                <p className="app-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  Chats
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {chats.length}
                </p>
              </Card>
              <Card className="p-4">
                <p className="app-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  Contacts
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {contacts.length}
                </p>
              </Card>
              <Card className="p-4">
                <p className="app-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  Unread
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {unreadCount}
                </p>
              </Card>
              <Card className="p-4">
                <p className="app-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  Realtime
                </p>
                <p className="mt-2 text-sm font-semibold capitalize text-white">
                  {connectionState}
                </p>
              </Card>
            </div>
          </div>
        </header>

        {statusBanner ? (
          <InlineAlert
            tone={statusBanner.tone}
            title={statusBanner.title}
            action={
              connectionState !== "connected" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => realtimeStore.getState().reconnect()}
                >
                  Переподключить
                </Button>
              ) : undefined
            }
          >
            {statusBanner.message}
          </InlineAlert>
        ) : null}

        <div className="min-h-0 flex flex-1 gap-4">
          <div className="app-shell hidden w-[372px] shrink-0 rounded-[34px] p-4 md:block">
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
              }}
              onOpenContact={(contact) => void handleOpenContact(contact)}
              onAddContact={(phone) => void handleAddContact(phone)}
              onRemoveContact={(contact) => void handleRemoveContact(contact)}
              onUpdateDisplayName={onUpdateDisplayName}
              onLogout={onLogout}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between gap-3 md:hidden">
              <Button variant="secondary" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-4 w-4" />
                Навигация
              </Button>
              <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-slate-300">
                {unreadCount} unread
              </div>
            </div>

            <div className="min-h-0 flex-1">
              {selectedChat ? (
                <ChatPanel
                  chat={selectedChat}
                  messages={messagesByChatId[selectedChat.id] ?? []}
                  currentUser={currentUser}
                  connectionState={connectionState}
                  isLoadingMessages={isLoadingMessages}
                  onBack={() => setSidebarOpen(true)}
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
                <div className="app-shell h-full rounded-[34px]">
                  <EmptyState />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isSidebarOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-slate-950/80 p-4 backdrop-blur-sm md:hidden"
          >
            <motion.div
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              className="app-shell mx-auto h-full max-w-md rounded-[34px] p-4"
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
                onOpenContact={(contact) => void handleOpenContact(contact)}
                onAddContact={(phone) => void handleAddContact(phone)}
                onRemoveContact={(contact) => void handleRemoveContact(contact)}
                onUpdateDisplayName={onUpdateDisplayName}
                onLogout={onLogout}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
