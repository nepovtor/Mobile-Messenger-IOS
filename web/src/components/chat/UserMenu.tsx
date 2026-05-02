import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import type { CurrentUser } from "../../types/auth";
import { ConnectionBadge } from "./ConnectionBadge";
import { Button } from "../ui/Button";
import type { ConnectionState } from "../../realtime/realtimeTypes";
import { Input } from "../ui/Input";
import { validateDisplayName } from "../../utils/displayName";

export function UserMenu({
  user,
  connectionState,
  onUpdateDisplayName,
  onLogout,
}: {
  user: CurrentUser;
  connectionState: ConnectionState;
  onUpdateDisplayName: (displayName: string) => Promise<void>;
  onLogout: () => void;
}) {
  const [isEditing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(user.displayName);
  }, [user.displayName]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {user.displayName}
          </p>
          <p className="truncate text-xs text-slate-400">{user.contact}</p>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionBadge state={connectionState} />
          <Button variant="ghost" className="px-3 py-2" onClick={onLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isEditing ? (
        <div className="mt-3 space-y-2">
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          {message ? <p className="text-xs text-slate-300">{message}</p> : null}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="px-3 py-2"
              onClick={() => {
                setDisplayName(user.displayName);
                setMessage(null);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              className="px-3 py-2"
              disabled={isSaving}
              onClick={async () => {
                const trimmed = displayName.trim();
                const validationMessage = validateDisplayName(trimmed);
                if (validationMessage) {
                  setMessage(validationMessage);
                  return;
                }
                setSaving(true);
                try {
                  await onUpdateDisplayName(trimmed);
                  setMessage("Display name updated.");
                  setEditing(false);
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Could not update display name.",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button
            variant="secondary"
            className="w-full px-3 py-2"
            onClick={() => {
              setMessage(null);
              setEditing(true);
            }}
          >
            Edit display name
          </Button>
        </div>
      )}
      {!isEditing && message ? (
        <p className="mt-2 text-xs text-slate-300">{message}</p>
      ) : null}
    </div>
  );
}
