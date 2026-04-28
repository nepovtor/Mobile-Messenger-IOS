import type { PropsWithChildren } from "react";
import clsx from "clsx";

export function Badge({
  children,
  tone = "neutral",
}: PropsWithChildren<{ tone?: "neutral" | "success" | "warning" | "danger" }>) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
        tone === "neutral" && "bg-white/8 text-slate-300",
        tone === "success" && "bg-emerald-400/15 text-emerald-200",
        tone === "warning" && "bg-amber-400/15 text-amber-200",
        tone === "danger" && "bg-rose-500/15 text-rose-200",
      )}
    >
      {children}
    </span>
  );
}
