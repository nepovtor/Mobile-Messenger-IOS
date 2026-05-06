import clsx from "clsx";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }

  return name.trim().slice(0, 2).toUpperCase() || "?";
}

const sizeClasses = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
} as const;

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-[22px] border border-white/12",
        "bg-[linear-gradient(135deg,rgba(251,191,36,0.22),rgba(249,115,22,0.24),rgba(56,189,248,0.3))]",
        "font-semibold text-white shadow-[0_20px_40px_rgba(15,23,42,0.32)] backdrop-blur-xl",
        sizeClasses[size],
        className,
      )}
    >
      {getInitials(name)}
    </div>
  );
}
