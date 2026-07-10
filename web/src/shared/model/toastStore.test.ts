import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastStore } from "@/shared/model/toastStore";

describe("toastStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastStore.getState().clear();
  });

  afterEach(() => {
    toastStore.getState().clear();
    vi.useRealTimers();
  });

  it("auto-removes toasts after the default 3000 ms", () => {
    toastStore.getState().showToast({
      tone: "info",
      title: "Тест",
      message: "Уведомление",
    });

    expect(toastStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(2999);
    expect(toastStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(toastStore.getState().toasts).toHaveLength(0);
  });
});
