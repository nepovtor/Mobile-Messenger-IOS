import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import clsx from "clsx";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={clsx(
        "w-full rounded-[22px] border border-white/10 bg-slate-950/72 px-4 py-3.5 text-sm text-white placeholder:text-slate-500",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition caret-cyan-200",
        "focus:border-cyan-200/70 focus:outline-none focus:ring-2 focus:ring-cyan-300/20",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={clsx(
        "w-full resize-none rounded-[22px] border border-white/10 bg-slate-950/72 px-4 py-3.5 text-sm text-white placeholder:text-slate-500",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition caret-cyan-200",
        "focus:border-cyan-200/70 focus:outline-none focus:ring-2 focus:ring-cyan-300/20",
        className,
      )}
      {...props}
    />
  );
});
