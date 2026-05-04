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
        "rounded-[28px] border border-white/10 bg-white/[0.07] backdrop-blur-2xl",
        "shadow-[0_24px_80px_rgba(2,6,23,0.45)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
