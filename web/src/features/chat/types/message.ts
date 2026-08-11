export type MessageStatus =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";
export type MessageKind = "text" | "image" | "audio";

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
  editedAt: string | null;
  deletedAt: string | null;
  clientMessageId?: string;
  error?: string | null;
  isLocal?: boolean;
};
