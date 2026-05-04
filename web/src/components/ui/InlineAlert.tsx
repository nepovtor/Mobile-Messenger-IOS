import type { PropsWithChildren, ReactNode } from "react";
import clsx from "clsx";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  type LucideIcon,
  TriangleAlert,
} from "lucide-react";

const iconsByTone = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
} satisfies Record<string, LucideIcon>;

const toneClasses = {
  info: "border-cyan-300/20 bg-cyan-400/10 text-cyan-50",
  success: "border-emerald-400/20 bg-emerald-500/12 text-emerald-50",
  warning: "border-amber-400/20 bg-amber-500/12 text-amber-50",
  danger: "border-rose-400/20 bg-rose-500/12 text-rose-50",
} as const;

export function InlineAlert({
  children,
  className,
  tone = "info",
  title,
  action,
}: PropsWithChildren<{
  className?: string;
  tone?: keyof typeof toneClasses;
  title?: string;
  action?: ReactNode;
}>) {
  const Icon = iconsByTone[tone];

  return (
    <div
      role="status"
      className={clsx(
        "flex gap-3 rounded-3xl border px-4 py-3 backdrop-blur-xl",
        toneClasses[tone],
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? (
          <div className="text-sm font-semibold text-white">{title}</div>
        ) : null}
        <div
          className={clsx("text-sm leading-6", title ? "mt-1 opacity-90" : "")}
        >
          {children}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
