import type { ConnectionState } from "../../realtime/realtimeTypes";
import { Badge } from "../ui/Badge";

const connectionMeta = {
  connected: {
    label: "Connected",
    tone: "success",
  },
  connecting: {
    label: "Connecting",
    tone: "neutral",
  },
  reconnecting: {
    label: "Reconnecting",
    tone: "warning",
  },
  disconnected: {
    label: "Offline",
    tone: "warning",
  },
  failed: {
    label: "Connection issue",
    tone: "danger",
  },
} as const;

function getConnectionBadgeMeta(state: ConnectionState) {
  return connectionMeta[state];
}

export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const meta = getConnectionBadgeMeta(state);

  return (
    <Badge tone={meta.tone} pulseDot>
      {meta.label}
    </Badge>
  );
}
