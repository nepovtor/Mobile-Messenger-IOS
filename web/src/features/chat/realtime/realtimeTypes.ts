import type { Message, MessageKind } from "@/features/chat/types/message";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export type RealtimeEnvelope<TData = unknown> = {
  event: string;
  data: TData;
};

export type MessageSendPayload = {
  chatID: string;
  clientMessageId: string;
  kind: MessageKind;
  text?: string;
  mediaID?: string;
};

export type MessageCreatedEvent = {
  chatID: string;
  message: Message;
};

export type MessageAckEvent = {
  chatID: string;
  clientMessageId: string;
  message: Message;
};

export type MessageFailedEvent = {
  chatID: string;
  clientMessageId: string;
  reason: string;
};

export type TypingEvent = {
  chatID: string;
  userID: string;
  displayName: string;
  isTyping: boolean;
  typingParticipants: string[];
};

export type ReadEvent = {
  chatID: string;
  messageID: string;
  userID: string;
  readAt: string;
};
