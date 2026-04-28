import type { HTMLAttributes, PropsWithChildren } from "react";
import clsx from "clsx";

export function Card({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      className={clsx(
        "rounded-3xl border border-white/10 bg-white/6 backdrop-blur-2xl",
        "shadow-[0_18px_80px_rgba(15,23,42,0.35)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
