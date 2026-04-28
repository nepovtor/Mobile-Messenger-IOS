import { Search } from "lucide-react";
import type { ChatSummary } from "../../types/chat";
import type { CurrentUser } from "../../types/auth";
import { ChatList } from "../chat/ChatList";
import { UserMenu } from "../chat/UserMenu";
import { Input } from "../ui/Input";
import type { ConnectionState } from "../../realtime/realtimeTypes";
import { useMemo, useState } from "react";

export function Sidebar({
  user,
  chats,
  selectedChatId,
  isLoading,
  connectionState,
  onSelectChat,
  onLogout,
}: {
  user: CurrentUser;
  chats: ChatSummary[];
  selectedChatId: string | null;
  isLoading: boolean;
  connectionState: ConnectionState;
  onSelectChat: (chatId: string) => void;
  onLogout: () => void;
}) {
  const [query, setQuery] = useState("");
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

  return (
    <aside className="flex h-full flex-col gap-4">
      <UserMenu
        user={user}
        connectionState={connectionState}
        onLogout={onLogout}
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <Input
          className="pl-10"
          placeholder="Search chats"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ChatList
          chats={filteredChats}
          selectedChatId={selectedChatId}
          isLoading={isLoading}
          onSelect={onSelectChat}
        />
      </div>
    </aside>
  );
}
