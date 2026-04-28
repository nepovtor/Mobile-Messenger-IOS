import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";

export function formatChatTimestamp(value: string): string {
  const date = new Date(value);
  if (isToday(date)) {
    return format(date, "HH:mm");
  }
  if (isYesterday(date)) {
    return "Yesterday";
  }
  return format(date, "MMM d");
}

export function formatMessageTimestamp(value: string): string {
  return format(new Date(value), "HH:mm");
}

export function formatRelativeStatus(value: string): string {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}
