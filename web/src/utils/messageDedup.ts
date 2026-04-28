import type { Message } from "../types/message";

export function dedupeMessages(messages: Message[]): Message[] {
  const result: Message[] = [];
  for (const message of messages) {
    const existingIndex = result.findIndex((candidate) =>
      isSameMessage(candidate, message),
    );

    if (existingIndex >= 0) {
      result[existingIndex] = mergeMessages(result[existingIndex], message);
    } else {
      result.push(message);
    }
  }

  return result.sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

export function upsertMessage(messages: Message[], incoming: Message): Message[] {
  return dedupeMessages([...messages, incoming]);
}

function mergeMessages(existing: Message | null, incoming: Message): Message {
  if (!existing) {
    return incoming;
  }

  return {
    ...existing,
    ...incoming,
    id: incoming.id || existing.id,
    messageID: incoming.messageID || existing.messageID,
    clientMessageId:
      incoming.clientMessageId || existing.clientMessageId || existing.messageID,
    error: incoming.error ?? existing.error ?? null,
  };
}

function isSameMessage(left: Message, right: Message): boolean {
  const leftKeys = new Set(
    [left.id, left.messageID, left.clientMessageId].filter(Boolean) as string[],
  );
  const rightKeys = [right.id, right.messageID, right.clientMessageId].filter(
    Boolean,
  ) as string[];

  return rightKeys.some((key) => leftKeys.has(key));
}
