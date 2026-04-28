export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";
export type MessageKind = "text" | "image";

export type Message = {
  id: string;
  messageID: string;
  chatID: string;
  authorID: string;
  authorName: string;
  kind: MessageKind;
  text: string | null;
  mediaID: string | null;
  mediaURL: string | null;
  status: MessageStatus;
  createdAt: string;
  clientMessageId?: string;
  error?: string | null;
  isLocal?: boolean;
};
