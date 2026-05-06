import { Bell, BellOff } from "lucide-react";
import { useEffect } from "react";
import { pushStore } from "../../store/pushStore";
import { Badge } from "./Badge";
import { Button } from "./Button";

function getStatusMeta(state: {
  capabilityState: ReturnType<typeof pushStore.getState>["capabilityState"];
  isSupported: boolean;
}) {
  if (!state.isSupported || state.capabilityState === "unsupported") {
    return {
      label: "Not supported",
      tone: "danger" as const,
      detail: "Этот браузер не поддерживает Service Worker или Push API.",
    };
  }

  if (state.capabilityState === "denied") {
    return {
      label: "No permission",
      tone: "warning" as const,
      detail: "Разрешение на уведомления отключено в настройках браузера.",
    };
  }

  if (state.capabilityState === "enabled") {
    return {
      label: "Enabled",
      tone: "success" as const,
      detail: "Новые сообщения будут приходить как реальные push-уведомления.",
    };
  }

  return {
    label: "Disabled",
    tone: "neutral" as const,
    detail:
      "Разрешение запрашивается только после нажатия на кнопку включения.",
  };
}

export function PushNotificationsPanel({
  className,
}: {
  className?: string;
}) {
  const capabilityState = pushStore((state) => state.capabilityState);
  const isSupported = pushStore((state) => state.isSupported);
  const isLoading = pushStore((state) => state.isLoading);
  const isInitialized = pushStore((state) => state.isInitialized);
  const isServerConfigured = pushStore((state) => state.isServerConfigured);
  const initialize = pushStore((state) => state.initialize);
  const enable = pushStore((state) => state.enable);
  const disable = pushStore((state) => state.disable);

  useEffect(() => {
    if (!isInitialized) {
      void initialize();
    }
  }, [initialize, isInitialized]);

  const meta = getStatusMeta({
    capabilityState,
    isSupported,
  });
  const canEnable =
    isSupported &&
    capabilityState !== "enabled" &&
    capabilityState !== "denied";
  const canDisable = capabilityState === "enabled";

  return (
    <div
      className={[
        "rounded-[18px] border border-white/8 bg-white/[0.03] p-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-cyan-200" />
            <p className="text-sm font-semibold text-white">
              Push-уведомления
            </p>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            {meta.detail}
          </p>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      {!isServerConfigured && isSupported ? (
        <p className="mt-3 text-[11px] leading-5 text-amber-200/90">
          Сервер пока не отдал VAPID-конфигурацию для Web Push.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {canEnable ? (
          <Button
            size="sm"
            disabled={isLoading}
            isLoading={isLoading}
            onClick={() => {
              void enable();
            }}
          >
            Включить
          </Button>
        ) : null}
        {canDisable ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={isLoading}
            isLoading={isLoading}
            onClick={() => {
              void disable();
            }}
          >
            <BellOff className="h-4 w-4" />
            Отключить
          </Button>
        ) : null}
      </div>
    </div>
  );
}
