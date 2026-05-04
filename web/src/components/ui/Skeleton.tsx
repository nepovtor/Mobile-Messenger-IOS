import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded-2xl border border-white/8 bg-white/[0.07]",
        "bg-[linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.1),rgba(255,255,255,0.04))] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}
