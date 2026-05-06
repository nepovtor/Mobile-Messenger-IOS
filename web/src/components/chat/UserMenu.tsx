import { LogOut, PencilLine } from "lucide-react";
import { useEffect, useState } from "react";
import type { CurrentUser } from "../../types/auth";
import { validateDisplayName } from "../../utils/displayName";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { Input } from "../ui/Input";
import type { ConnectionState } from "../../realtime/realtimeTypes";
import { ConnectionBadge } from "./ConnectionBadge";

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
  const [messageTone, setMessageTone] = useState<"success" | "danger">(
    "success",
  );
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(user.displayName);
  }, [user.displayName]);

  return (
    <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-4">
      <div className="app-kicker">Profile</div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={user.displayName} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">
              {user.displayName}
            </p>
            <p className="truncate text-sm text-slate-400">
              {user.phone ?? user.contact}
            </p>
            <div className="mt-2">
              <ConnectionBadge state={connectionState} />
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onLogout}>
          <LogOut className="h-4 w-4" />
          Выйти
        </Button>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-400">
        Токен сессии хранится локально в браузере и очищается при выходе.
      </p>

      {isEditing ? (
        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <label
              className="text-sm font-medium text-slate-200"
              htmlFor="display-name"
            >
              Имя профиля
            </label>
            <Input
              id="display-name"
              aria-label="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>

          {message ? (
            <InlineAlert tone={messageTone} title="Profile update">
              {message}
            </InlineAlert>
          ) : null}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              block
              onClick={() => {
                setDisplayName(user.displayName);
                setMessage(null);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              block
              isLoading={isSaving}
              disabled={isSaving}
              onClick={async () => {
                const trimmed = displayName.trim();
                const validationMessage = validateDisplayName(trimmed);
                if (validationMessage) {
                  setMessage(validationMessage);
                  setMessageTone("danger");
                  return;
                }

                setSaving(true);
                try {
                  await onUpdateDisplayName(trimmed);
                  setMessage("Display name updated.");
                  setMessageTone("success");
                  setEditing(false);
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Could not update display name.",
                  );
                  setMessageTone("danger");
                } finally {
                  setSaving(false);
                }
              }}
            >
              Сохранить
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setMessage(null);
              setEditing(true);
            }}
          >
            <PencilLine className="h-4 w-4" />
            Изменить имя
          </Button>
        </div>
      )}

      {!isEditing && message ? (
        <div className="mt-4">
          <InlineAlert tone={messageTone} title="Profile update">
            {message}
          </InlineAlert>
        </div>
      ) : null}
    </div>
  );
}
