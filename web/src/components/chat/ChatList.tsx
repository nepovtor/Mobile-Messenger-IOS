import type { ChatSummary } from "../../types/chat";
import { Skeleton } from "../ui/Skeleton";
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
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.04] px-4 py-10 text-center text-sm leading-6 text-slate-400">
        Пока нет диалогов. Откройте вкладку контактов, чтобы быстро создать
        личную переписку по номеру телефона.
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
