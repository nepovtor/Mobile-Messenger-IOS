import clsx from "clsx";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-cyan-300",
        className,
      )}
    />
  );
}
