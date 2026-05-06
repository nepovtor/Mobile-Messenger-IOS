import { LogOut, PencilLine } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConnectionState } from "../../realtime/realtimeTypes";
import { toastStore } from "../../store/toastStore";
import type { CurrentUser } from "../../types/auth";
import { validateDisplayName } from "../../utils/displayName";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { PushNotificationsPanel } from "../ui/PushNotificationsPanel";
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
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(user.displayName);
  }, [user.displayName]);

  return (
    <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-4">
      <div className="app-kicker">Профиль</div>
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
              aria-label="Имя профиля"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              block
              onClick={() => {
                setDisplayName(user.displayName);
                setEditing(false);
              }}
            >
              Отмена
            </Button>
            <Button
              block
              isLoading={isSaving}
              disabled={isSaving}
              onClick={async () => {
                const trimmed = displayName.trim();
                const validationMessage = validateDisplayName(trimmed);
                if (validationMessage) {
                  toastStore.getState().showToast({
                    tone: "warning",
                    title: "Профиль",
                    message: validationMessage,
                  });
                  return;
                }

                setSaving(true);
                try {
                  await onUpdateDisplayName(trimmed);
                  toastStore.getState().showToast({
                    tone: "success",
                    title: "Профиль",
                    message: "Имя обновлено",
                  });
                  setEditing(false);
                } catch (error) {
                  toastStore.getState().showToast({
                    tone: "danger",
                    title: "Профиль",
                    message:
                      error instanceof Error
                        ? error.message
                        : "Не удалось обновить имя.",
                  });
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
            onClick={() => setEditing(true)}
          >
            <PencilLine className="h-4 w-4" />
            Изменить имя
          </Button>
        </div>
      )}

      <div className="mt-4">
        <PushNotificationsPanel />
      </div>
    </div>
  );
}
