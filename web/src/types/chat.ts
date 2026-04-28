import type { Message } from "./message";

export type ChatSummary = {
  id: string;
  title: string;
  lastMessagePreview: string | null;
  lastActivity: string;
  unreadCount: number;
  typingParticipants: string[];
  participantNames: string[];
  participantCount: number;
};

export type MessagesByChatId = Record<string, Message[]>;
