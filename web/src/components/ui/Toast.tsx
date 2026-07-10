import clsx from "clsx";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Toast as ToastModel } from "@/shared/model/toastStore";

const iconsByTone = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
} satisfies Record<ToastModel["tone"], LucideIcon>;

const toneClasses = {
  info: "border-cyan-300/18 bg-[#0c1a29]/94 text-cyan-50",
  success: "border-emerald-400/18 bg-[#0c1916]/95 text-emerald-50",
  warning: "border-amber-400/18 bg-[#1b160e]/95 text-amber-50",
  danger: "border-rose-400/18 bg-[#1f1116]/95 text-rose-50",
} satisfies Record<ToastModel["tone"], string>;

export function Toast({
  toast,
  onClose,
}: {
  toast: ToastModel;
  onClose: () => void;
}) {
  const Icon = iconsByTone[toast.tone];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.97 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={clsx(
        "pointer-events-auto w-full rounded-[24px] border px-4 py-3.5 shadow-[0_24px_70px_rgba(3,8,20,0.5)] backdrop-blur-2xl",
        toneClasses[toast.tone],
      )}
      role={toast.tone === "danger" ? "alert" : "status"}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          {toast.title ? (
            <div className="text-sm font-semibold text-white">
              {toast.title}
            </div>
          ) : null}
          <div
            className={clsx(
              "text-sm leading-6",
              toast.title ? "mt-1 opacity-90" : "",
            )}
          >
            {toast.message}
          </div>
        </div>
        <button
          type="button"
          aria-label="Закрыть уведомление"
          className="rounded-full p-1 text-current/80 transition hover:bg-white/6 hover:text-white"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
