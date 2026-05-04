import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import clsx from "clsx";
import { Spinner } from "./Spinner";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    block?: boolean;
    size?: "sm" | "md" | "lg";
    isLoading?: boolean;
  }
>;

export function Button({
  children,
  className,
  variant = "primary",
  block = false,
  size = "md",
  isLoading = false,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
        "disabled:cursor-not-allowed disabled:opacity-60",
        block && "w-full",
        size === "sm" && "px-3 py-2 text-xs",
        size === "md" && "px-4 py-3 text-sm",
        size === "lg" && "px-5 py-3.5 text-sm",
        variant === "primary" &&
          "bg-gradient-to-r from-cyan-300 via-blue-500 to-indigo-500 text-slate-950 shadow-[0_18px_45px_rgba(34,211,238,0.24)] hover:-translate-y-0.5 hover:brightness-110",
        variant === "secondary" &&
          "border border-white/12 bg-white/8 text-white hover:-translate-y-0.5 hover:border-cyan-300/20 hover:bg-white/12",
        variant === "ghost" &&
          "text-slate-300 hover:bg-white/8 hover:text-white",
        variant === "danger" &&
          "border border-rose-400/30 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25",
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}
