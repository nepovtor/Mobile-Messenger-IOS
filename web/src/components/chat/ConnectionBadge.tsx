import type { ConnectionState } from "../../realtime/realtimeTypes";
import { Badge } from "../ui/Badge";

const labelByState: Record<ConnectionState, string> = {
  connected: "Connected",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  disconnected: "Offline",
  failed: "Connection issue",
};

const toneByState: Record<ConnectionState, "neutral" | "success" | "warning" | "danger"> = {
  connected: "success",
  connecting: "neutral",
  reconnecting: "warning",
  disconnected: "warning",
  failed: "danger",
};

export function ConnectionBadge({ state }: { state: ConnectionState }) {
  return <Badge tone={toneByState[state]}>{labelByState[state]}</Badge>;
}
