import type { ChatSummary } from "@/features/chat/types/chat";
import { Skeleton } from "@/components/ui/Skeleton";
import { ChatListItem } from "@/features/chat/ui/ChatListItem";

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
      <div className="space-y-1 px-2 py-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[76px] rounded-[18px]" />
        ))}
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="px-2 py-2">
        <div className="rounded-[18px] border border-dashed border-white/8 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
          Нет чатов
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 px-2 py-2">
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
