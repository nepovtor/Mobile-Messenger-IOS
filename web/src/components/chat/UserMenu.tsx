import { LogOut } from "lucide-react";
import type { CurrentUser } from "../../types/auth";
import { ConnectionBadge } from "./ConnectionBadge";
import { Button } from "../ui/Button";
import type { ConnectionState } from "../../realtime/realtimeTypes";

export function UserMenu({
  user,
  connectionState,
  onLogout,
}: {
  user: CurrentUser;
  connectionState: ConnectionState;
  onLogout: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/6 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">{user.displayName}</p>
        <p className="truncate text-xs text-slate-400">{user.contact}</p>
      </div>
      <div className="flex items-center gap-2">
        <ConnectionBadge state={connectionState} />
        <Button variant="ghost" className="px-3 py-2" onClick={onLogout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
