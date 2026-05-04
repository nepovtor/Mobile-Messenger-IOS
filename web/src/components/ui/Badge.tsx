import type { PropsWithChildren } from "react";
import clsx from "clsx";

export function Badge({
  children,
  tone = "neutral",
  pulseDot = false,
}: PropsWithChildren<{
  tone?: "neutral" | "success" | "warning" | "danger";
  pulseDot?: boolean;
}>) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-[0.02em]",
        tone === "neutral" && "border-white/10 bg-white/8 text-slate-300",
        tone === "success" &&
          "border-emerald-400/20 bg-emerald-400/15 text-emerald-100",
        tone === "warning" &&
          "border-amber-400/20 bg-amber-400/15 text-amber-100",
        tone === "danger" && "border-rose-500/20 bg-rose-500/15 text-rose-100",
      )}
    >
      {pulseDot ? (
        <span
          className={clsx(
            "h-1.5 w-1.5 rounded-full",
            tone === "neutral" && "bg-slate-300",
            tone === "success" && "bg-emerald-300",
            tone === "warning" && "bg-amber-300",
            tone === "danger" && "bg-rose-300",
          )}
        />
      ) : null}
      {children}
    </span>
  );
}
