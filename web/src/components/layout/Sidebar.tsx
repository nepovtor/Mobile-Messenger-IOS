import { Search } from "lucide-react";
import type { ChatSummary } from "../../types/chat";
import type { CurrentUser } from "../../types/auth";
import type { ContactEntry } from "../../types/contact";
import { ChatList } from "../chat/ChatList";
import { UserMenu } from "../chat/UserMenu";
import { Input } from "../ui/Input";
import type { ConnectionState } from "../../realtime/realtimeTypes";
import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function Sidebar({
  user,
  chats,
  contacts,
  selectedChatId,
  isLoading,
  isLoadingContacts,
  connectionState,
  contactsError,
  contactsNotice,
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
  contactsError: string | null;
  contactsNotice: string | null;
  isAddingContact: boolean;
  openingContactId: string | null;
  removingContactId: string | null;
  onSelectChat: (chatId: string) => void;
  onOpenContact: (contact: ContactEntry) => void;
  onAddContact: (phone: string) => void;
  onRemoveContact: (contact: ContactEntry) => void;
  onUpdateDisplayName: (displayName: string) => Promise<void>;
  onLogout: () => void;
}) {
  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState("");
  const [activeTab, setActiveTab] = useState<"chats" | "contacts">("chats");
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

  return (
    <aside className="flex h-full flex-col gap-4">
      <UserMenu
        user={user}
        connectionState={connectionState}
        onUpdateDisplayName={onUpdateDisplayName}
        onLogout={onLogout}
      />
      <WorkspaceSwitcher />
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/6 p-1">
        <button
          className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
            activeTab === "chats" ? "bg-white/12 text-white" : "text-slate-400"
          }`}
          onClick={() => setActiveTab("chats")}
        >
          Chats
        </button>
        <button
          className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
            activeTab === "contacts"
              ? "bg-white/12 text-white"
              : "text-slate-400"
          }`}
          onClick={() => setActiveTab("contacts")}
        >
          Contacts
        </button>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <Input
          className="pl-10"
          placeholder={
            activeTab === "chats" ? "Search chats" : "Search contacts"
          }
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {activeTab === "chats" ? (
          <ChatList
            chats={filteredChats}
            selectedChatId={selectedChatId}
            isLoading={isLoading}
            onSelect={onSelectChat}
          />
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
              <p className="mb-2 text-sm font-semibold text-white">
                Add contact by phone
              </p>
              <Input
                placeholder="+375291234567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              <Button
                block
                className="mt-3"
                disabled={isAddingContact || !phone.trim()}
                onClick={() => {
                  const trimmed = phone.trim();
                  void onAddContact(trimmed);
                  setPhone("");
                }}
              >
                {isAddingContact ? "Adding..." : "Add contact"}
              </Button>
            </div>

            {contactsNotice ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {contactsNotice}
              </div>
            ) : null}
            {contactsError ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                {contactsError}
              </div>
            ) : null}

            {isLoadingContacts ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-20 animate-pulse rounded-2xl border border-white/8 bg-white/6"
                  />
                ))}
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 px-4 py-10 text-center text-sm text-slate-400">
                No contacts yet. Add someone by phone to start a direct chat.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="rounded-2xl border border-white/10 bg-white/6 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          {contact.displayName}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {contact.phone}
                        </p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200/70">
                          {contact.directChatID
                            ? "Direct chat ready"
                            : "Chat opens on demand"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          className="px-3 py-2"
                          disabled={openingContactId === contact.id}
                          onClick={() => onOpenContact(contact)}
                        >
                          {openingContactId === contact.id
                            ? "Opening..."
                            : "Open"}
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-3 py-2 text-rose-200 hover:text-rose-100"
                          disabled={removingContactId === contact.id}
                          onClick={() => onRemoveContact(contact)}
                        >
                          {removingContactId === contact.id ? "..." : "Remove"}
                        </Button>
                      </div>
                    </div>
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
