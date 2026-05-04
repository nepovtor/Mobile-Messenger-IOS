import { Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { CurrentUser } from "../../types/auth";
import type { ChatSummary } from "../../types/chat";
import type { ContactEntry } from "../../types/contact";
import type { ConnectionState } from "../../realtime/realtimeTypes";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { Input } from "../ui/Input";
import { Skeleton } from "../ui/Skeleton";
import { ChatList } from "../chat/ChatList";
import { UserMenu } from "../chat/UserMenu";
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
      <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-4">
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">
          Workspace
        </p>
        <h2 className="mt-3 text-xl font-semibold text-white">
          Messenger dashboard
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Realtime chats, direct contacts, profile controls, and map access in
          one presentation-friendly layout.
        </p>
      </div>

      <UserMenu
        user={user}
        connectionState={connectionState}
        onUpdateDisplayName={onUpdateDisplayName}
        onLogout={onLogout}
      />

      <WorkspaceSwitcher />

      <div className="grid grid-cols-2 gap-2 rounded-[24px] border border-white/10 bg-white/[0.06] p-1">
        <button
          type="button"
          aria-pressed={activeTab === "chats"}
          className={`rounded-[18px] px-3 py-2 text-sm font-medium transition ${
            activeTab === "chats"
              ? "bg-white/[0.12] text-white"
              : "text-slate-400"
          }`}
          onClick={() => setActiveTab("chats")}
        >
          Chats ({chats.length})
        </button>
        <button
          type="button"
          aria-pressed={activeTab === "contacts"}
          className={`rounded-[18px] px-3 py-2 text-sm font-medium transition ${
            activeTab === "contacts"
              ? "bg-white/[0.12] text-white"
              : "text-slate-400"
          }`}
          onClick={() => setActiveTab("contacts")}
        >
          Contacts ({contacts.length})
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <Input
          aria-label={
            activeTab === "chats" ? "Search chats" : "Search contacts"
          }
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
            <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-4">
              <p className="mb-2 text-sm font-semibold text-white">
                Add contact by phone
              </p>
              <p className="mb-3 text-xs leading-5 text-slate-400">
                Add a contact by phone to start messaging
              </p>
              <Input
                aria-label="Contact phone"
                placeholder="+375291234567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              <Button
                block
                className="mt-3"
                disabled={isAddingContact || !phone.trim()}
                isLoading={isAddingContact}
                onClick={() => void onAddContact(phone.trim())}
              >
                Add contact
              </Button>
            </div>

            {contactsNotice ? (
              <InlineAlert tone="success" title="Contacts">
                {contactsNotice}
              </InlineAlert>
            ) : null}

            {contactsError ? (
              <InlineAlert tone="danger" title="Contacts">
                {contactsError}
              </InlineAlert>
            ) : null}

            {isLoadingContacts ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-24" />
                ))}
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="rounded-[26px] border border-dashed border-white/10 bg-white/[0.04] px-4 py-10 text-center text-sm leading-6 text-slate-400">
                Add a contact by phone to start messaging
              </div>
            ) : (
              <div className="space-y-3">
                {filteredContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="rounded-[26px] border border-white/10 bg-white/[0.06] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <Avatar name={contact.displayName} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">
                            {contact.displayName}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {contact.phone}
                          </p>
                          <div className="mt-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200/70">
                            <Users className="h-3.5 w-3.5" />
                            {contact.directChatID
                              ? "Direct chat ready"
                              : "Chat opens on demand"}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={openingContactId === contact.id}
                          onClick={() => onOpenContact(contact)}
                        >
                          {openingContactId === contact.id
                            ? "Opening..."
                            : "Open"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-200 hover:text-rose-100"
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
