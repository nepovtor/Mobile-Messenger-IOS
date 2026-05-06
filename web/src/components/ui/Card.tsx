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
        "rounded-[30px] border border-white/10",
        "bg-[linear-gradient(180deg,rgba(14,20,34,0.92),rgba(8,13,24,0.84))] backdrop-blur-2xl",
        "shadow-[0_30px_90px_rgba(3,8,20,0.46)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
