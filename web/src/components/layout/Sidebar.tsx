import clsx from "clsx";
import {
  LogOut,
  MessageSquareText,
  PencilLine,
  Search,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import appIcon from "../../../../MobileMessengerIOS/Assets.xcassets/AppIcon.appiconset/icon-180.png";
import type { ConnectionState } from "../../realtime/realtimeTypes";
import { toastStore } from "../../store/toastStore";
import type { CurrentUser } from "../../types/auth";
import type { ChatSummary } from "../../types/chat";
import type { ContactEntry } from "../../types/contact";
import { validateDisplayName } from "../../utils/displayName";
import { ChatList } from "../chat/ChatList";
import { ConnectionBadge } from "../chat/ConnectionBadge";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { PushNotificationsPanel } from "../ui/PushNotificationsPanel";
import { Skeleton } from "../ui/Skeleton";

export function Sidebar({
  user,
  chats,
  contacts,
  selectedChatId,
  isLoading,
  isLoadingContacts,
  connectionState,
  isAddingContact,
  openingContactId,
  removingContactId,
  onSelectChat,
  onOpenContact,
  onAddContact,
  onRemoveContact,
  onUpdateDisplayName,
  onLogout,
}: {
  user: CurrentUser;
  chats: ChatSummary[];
  contacts: ContactEntry[];
  selectedChatId: string | null;
  isLoading: boolean;
  isLoadingContacts: boolean;
  connectionState: ConnectionState;
  isAddingContact: boolean;
  openingContactId: string | null;
  removingContactId: string | null;
  onSelectChat: (chatId: string) => void;
  onOpenContact: (contact: ContactEntry) => Promise<boolean>;
  onAddContact: (phone: string) => Promise<boolean>;
  onRemoveContact: (contact: ContactEntry) => Promise<boolean>;
  onUpdateDisplayName: (displayName: string) => Promise<void>;
  onLogout: () => void;
}) {
  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState("");
  const [activeTab, setActiveTab] = useState<"chats" | "contacts">("chats");
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isEditingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [isSavingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setDisplayName(user.displayName);
  }, [user.displayName]);

  const filteredChats = useMemo(() => {
    if (!query.trim()) {
      return chats;
    }

    const normalized = query.trim().toLowerCase();
    return chats.filter((chat) =>
      [chat.title, chat.lastMessagePreview, ...chat.participantNames]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized)),
    );
  }, [chats, query]);

  const filteredContacts = useMemo(() => {
    if (!query.trim()) {
      return contacts;
    }

    const normalized = query.trim().toLowerCase();
    return contacts.filter((contact) =>
      [contact.displayName, contact.phone].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    );
  }, [contacts, query]);

  const connectionDotClass = getConnectionDotClass(connectionState);

  return (
    <aside className="flex h-full min-h-0 flex-col bg-slate-950/28">
      <div className="border-b border-white/8 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={appIcon}
              alt=""
              aria-hidden="true"
              className="h-10 w-10 rounded-[14px] shadow-[0_14px_30px_rgba(5,12,24,0.24)]"
              draggable={false}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                Mobile Messenger
              </p>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              aria-label="Профиль"
              className="relative rounded-[16px] p-0.5 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
              onClick={() => {
                setMenuOpen((value) => !value);
                setEditingProfile(false);
              }}
            >
              <Avatar
                name={user.displayName}
                size="sm"
                className="h-10 w-10 rounded-[16px] text-[11px] shadow-none"
              />
              <span
                className={clsx(
                  "absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-slate-950",
                  connectionDotClass,
                )}
              />
            </button>

            {isMenuOpen ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-[310px] rounded-[20px] border border-white/10 bg-[#0b1420]/96 p-3 shadow-[0_26px_70px_rgba(3,8,20,0.48)] backdrop-blur-2xl">
                <div className="flex items-center gap-3 border-b border-white/8 pb-3">
                  <Avatar name={user.displayName} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {user.displayName}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {user.phone ?? user.contact}
                    </p>
                    <div className="mt-2">
                      <ConnectionBadge state={connectionState} />
                    </div>
                  </div>
                </div>

                {isEditingProfile ? (
                  <div className="space-y-3 pt-3">
                    <div className="space-y-2">
                      <label
                        className="text-xs font-medium text-slate-300"
                        htmlFor="sidebar-display-name"
                      >
                        Имя
                      </label>
                      <Input
                        id="sidebar-display-name"
                        aria-label="Имя"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setDisplayName(user.displayName);
                          setEditingProfile(false);
                        }}
                      >
                        Отмена
                      </Button>
                      <Button
                        isLoading={isSavingProfile}
                        disabled={isSavingProfile}
                        onClick={() => {
                          void (async () => {
                            const trimmed = displayName.trim();
                            const validationMessage = validateDisplayName(
                              trimmed,
                            );

                            if (validationMessage) {
                              toastStore.getState().showToast({
                                tone: "warning",
                                title: "Профиль",
                                message: validationMessage,
                              });
                              return;
                            }

                            setSavingProfile(true);
                            try {
                              await onUpdateDisplayName(trimmed);
                              toastStore.getState().showToast({
                                tone: "success",
                                title: "Профиль",
                                message: "Имя обновлено",
                              });
                              setEditingProfile(false);
                            } catch (error) {
                              toastStore.getState().showToast({
                                tone: "danger",
                                title: "Профиль",
                                message:
                                  error instanceof Error
                                    ? error.message
                                    : "Не удалось обновить имя",
                              });
                            } finally {
                              setSavingProfile(false);
                            }
                          })();
                        }}
                      >
                        Сохранить
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 pt-3">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-[16px] px-3 py-2.5 text-left text-sm text-slate-100 transition hover:bg-white/[0.06]"
                      onClick={() => setEditingProfile(true)}
                    >
                      <PencilLine className="h-4 w-4" />
                      Изменить имя
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-[16px] px-3 py-2.5 text-left text-sm text-rose-100 transition hover:bg-rose-500/12"
                      onClick={onLogout}
                    >
                      <LogOut className="h-4 w-4" />
                      Выйти
                    </button>
                  </div>
                )}

                <div className="mt-3 border-t border-white/8 pt-3">
                  <PushNotificationsPanel />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            aria-label="Поиск"
            className="h-11 rounded-[16px] border-white/8 bg-slate-950/70 pl-10"
            placeholder="Поиск"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-[18px] border border-white/8 bg-white/[0.03] p-1">
          <button
            type="button"
            aria-pressed={activeTab === "chats"}
            className={clsx(
              "flex items-center justify-center gap-2 rounded-[14px] px-3 py-2.5 text-sm font-medium transition",
              activeTab === "chats"
                ? "bg-white/[0.09] text-white"
                : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100",
            )}
            onClick={() => setActiveTab("chats")}
          >
            <MessageSquareText className="h-4 w-4" />
            Чаты
          </button>
          <button
            type="button"
            aria-pressed={activeTab === "contacts"}
            className={clsx(
              "flex items-center justify-center gap-2 rounded-[14px] px-3 py-2.5 text-sm font-medium transition",
              activeTab === "contacts"
                ? "bg-white/[0.09] text-white"
                : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100",
            )}
            onClick={() => setActiveTab("contacts")}
          >
            <Users className="h-4 w-4" />
            Контакты
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {activeTab === "chats" ? (
          <ChatList
            chats={filteredChats}
            selectedChatId={selectedChatId}
            isLoading={isLoading}
            onSelect={onSelectChat}
          />
        ) : (
          <div className="space-y-3 px-2 pb-2">
            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-3">
              <div className="flex gap-2">
                <Input
                  aria-label="Телефон контакта"
                  placeholder="+375291234567"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="h-10 rounded-[14px] border-white/8 bg-slate-950/72"
                />
                <Button
                  className="h-10 shrink-0 px-4"
                  size="sm"
                  disabled={isAddingContact || !phone.trim()}
                  isLoading={isAddingContact}
                  onClick={() => {
                    void (async () => {
                      const success = await onAddContact(phone.trim());
                      if (success) {
                        setPhone("");
                      }
                    })();
                  }}
                >
                  Добавить
                </Button>
              </div>
            </div>

            {isLoadingContacts ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-[68px] rounded-[18px]" />
                ))}
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-white/8 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
                Нет контактов
              </div>
            ) : (
              <div className="space-y-1">
                {filteredContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center gap-2 rounded-[18px] px-2 py-2 transition hover:bg-white/[0.04]"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] px-2 py-1 text-left"
                      onClick={() => {
                        void onOpenContact(contact);
                      }}
                    >
                      <Avatar name={contact.displayName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {contact.displayName}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {contact.phone}
                        </p>
                      </div>
                      {openingContactId === contact.id ? (
                        <span className="text-[11px] text-slate-500">
                          Открытие...
                        </span>
                      ) : (
                        <UserRound className="h-4 w-4 text-slate-500" />
                      )}
                    </button>

                    <button
                      type="button"
                      aria-label="Удалить контакт"
                      className="rounded-[14px] p-2 text-slate-500 transition hover:bg-rose-500/12 hover:text-rose-100"
                      disabled={removingContactId === contact.id}
                      onClick={() => {
                        void onRemoveContact(contact);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function getConnectionDotClass(state: ConnectionState) {
  if (state === "connected") {
    return "bg-emerald-400";
  }

  if (state === "connecting" || state === "reconnecting") {
    return "bg-amber-400";
  }

  return "bg-rose-400";
}
