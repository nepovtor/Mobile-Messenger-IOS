import { create } from "zustand";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type Toast = {
  id: string;
  tone: ToastTone;
  title?: string;
  message: string;
  createdAt: number;
  durationMs: number;
  dedupeKey?: string;
};

type ToastInput = {
  tone: ToastTone;
  title?: string;
  message: string;
  durationMs?: number;
  dedupeKey?: string;
};

type ToastStore = {
  toasts: Toast[];
  showToast: (input: ToastInput) => string;
  removeToast: (id: string) => void;
  clear: () => void;
};

const DEFAULT_DURATION_MS = 3000;
const activeTimers = new Map<string, number>();

export const toastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  showToast(input) {
    const durationMs = input.durationMs ?? DEFAULT_DURATION_MS;
    const existingToast = input.dedupeKey
      ? get().toasts.find((toast) => toast.dedupeKey === input.dedupeKey)
      : null;

    if (existingToast) {
      return existingToast.id;
    }

    const toast: Toast = {
      id: crypto.randomUUID(),
      tone: input.tone,
      title: input.title,
      message: input.message,
      createdAt: Date.now(),
      durationMs,
      dedupeKey: input.dedupeKey,
    };

    set((state) => ({
      toasts: [...state.toasts, toast],
    }));

    const timer = window.setTimeout(() => {
      get().removeToast(toast.id);
    }, durationMs);
    activeTimers.set(toast.id, timer);

    return toast.id;
  },
  removeToast(id) {
    const timer = activeTimers.get(id);
    if (timer) {
      window.clearTimeout(timer);
      activeTimers.delete(id);
    }

    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
  clear() {
    for (const timer of activeTimers.values()) {
      window.clearTimeout(timer);
    }
    activeTimers.clear();
    set({ toasts: [] });
  },
}));
