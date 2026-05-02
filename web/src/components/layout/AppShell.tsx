import { Menu } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { chatApi } from "../../api/chatApi";
import { contactsApi } from "../../api/contactsApi";
import { chatStore } from "../../store/chatStore";
import { realtimeStore } from "../../store/realtimeStore";
import type { CurrentUser } from "../../types/auth";
import type { ContactEntry } from "../../types/contact";
import {
  mapContactErrorMessage,
  validateContactPhone,
} from "../../utils/contacts";
import { ChatPanel } from "./ChatPanel";
import { EmptyState } from "./EmptyState";
import { Sidebar } from "./Sidebar";
import { Button } from "../ui/Button";

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
        result.alreadyExists ? "Contact already added." : "Contact added.",
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
      setContactsNotice("Contact removed.");
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
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.28),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(34,211,238,0.16),_transparent_26%),linear-gradient(180deg,#020617,#0f172a)] px-4 py-4 sm:px-6 sm:py-6">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] opacity-20" />
      <div className="relative mx-auto flex h-[calc(100vh-2rem)] max-w-[1440px] gap-4 sm:h-[calc(100vh-3rem)]">
        {chatError || realtimeError ? (
          <div className="absolute inset-x-0 top-0 z-20 mx-auto max-w-3xl px-4">
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/12 px-4 py-3 text-sm text-rose-100 backdrop-blur-xl">
              {chatError || realtimeError}
            </div>
          </div>
        ) : null}
        <div className="hidden w-[360px] shrink-0 rounded-[32px] border border-white/10 bg-slate-950/40 p-4 backdrop-blur-2xl md:block">
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
          <div className="mb-3 flex items-center justify-between md:hidden">
            <Button
              variant="secondary"
              className="px-3 py-2"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="mr-2 h-4 w-4" />
              Chats
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            {selectedChat ? (
              <ChatPanel
                chat={selectedChat}
                messages={messagesByChatId[selectedChat.id] ?? []}
                currentUser={currentUser}
                connectionState={connectionState}
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
              <div className="h-full rounded-[28px] border border-white/10 bg-white/6 backdrop-blur-2xl">
                <EmptyState />
              </div>
            )}
          </div>
        </div>
      </div>

      {isSidebarOpen ? (
        <div className="fixed inset-0 z-30 bg-slate-950/80 p-4 backdrop-blur-sm md:hidden">
          <div className="mx-auto h-full max-w-md rounded-[32px] border border-white/10 bg-slate-950/92 p-4">
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
