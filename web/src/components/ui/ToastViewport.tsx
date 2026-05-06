import { AnimatePresence } from "framer-motion";
import { toastStore } from "../../store/toastStore";
import { Toast } from "./Toast";

export function ToastViewport() {
  const toasts = toastStore((state) => state.toasts);
  const removeToast = toastStore((state) => state.removeToast);

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[120] flex flex-col gap-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-full sm:max-w-[380px]">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
