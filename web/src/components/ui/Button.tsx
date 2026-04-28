import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import clsx from "clsx";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    block?: boolean;
  }
>;

export function Button({
  children,
  className,
  variant = "primary",
  block = false,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
        "disabled:cursor-not-allowed disabled:opacity-60",
        block && "w-full",
        variant === "primary" &&
          "bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 text-slate-950 shadow-[0_18px_45px_rgba(34,211,238,0.25)] hover:brightness-110",
        variant === "secondary" &&
          "border border-white/12 bg-white/8 text-white hover:bg-white/12",
        variant === "ghost" && "text-slate-300 hover:bg-white/8 hover:text-white",
        variant === "danger" &&
          "border border-rose-400/30 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
