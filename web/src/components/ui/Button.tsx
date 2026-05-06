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
        "inline-flex items-center justify-center gap-2 rounded-[22px] font-semibold tracking-[0.01em] transition duration-200",
        "backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
        "disabled:cursor-not-allowed disabled:opacity-60",
        block && "w-full",
        size === "sm" && "px-3.5 py-2 text-xs",
        size === "md" && "px-4.5 py-3 text-sm",
        size === "lg" && "px-5 py-3.5 text-sm",
        variant === "primary" &&
          "bg-[linear-gradient(135deg,#fbbf24,#fb923c_48%,#67e8f9)] text-slate-950 shadow-[0_20px_50px_rgba(251,146,60,0.28)] hover:-translate-y-0.5 hover:brightness-110",
        variant === "secondary" &&
          "border border-white/12 bg-white/[0.06] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:-translate-y-0.5 hover:border-white/18 hover:bg-white/[0.1]",
        variant === "ghost" &&
          "text-slate-300 hover:bg-white/[0.06] hover:text-white",
        variant === "danger" &&
          "border border-rose-400/28 bg-rose-500/12 text-rose-50 hover:bg-rose-500/20",
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
