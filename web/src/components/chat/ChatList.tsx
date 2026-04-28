import type { ChatSummary } from "../../types/chat";
import { ChatListItem } from "./ChatListItem";

export function ChatList({
  chats,
  selectedChatId,
  isLoading,
  onSelect,
}: {
  chats: ChatSummary[];
  selectedChatId: string | null;
  isLoading: boolean;
  onSelect: (chatId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-2xl border border-white/8 bg-white/6"
          />
        ))}
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 px-4 py-10 text-center text-sm text-slate-400">
        No chats found for this account yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {chats.map((chat) => (
        <ChatListItem
          key={chat.id}
          chat={chat}
          isActive={chat.id === selectedChatId}
          onClick={() => onSelect(chat.id)}
        />
      ))}
    </div>
  );
}
