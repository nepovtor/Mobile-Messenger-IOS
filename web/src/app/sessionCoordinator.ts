import { registerUnauthorizedHandler } from "@/shared/api/httpClient";
import { authStore } from "@/features/auth/model/authStore";
import { chatStore } from "@/features/chat/model/chatStore";
import { realtimeStore } from "@/features/chat/model/realtimeStore";
import { locationStore } from "@/features/location/model/locationStore";
import { pushStore } from "@/features/push/model/pushStore";
import { purgeLegacyAuthStorage } from "@/utils/legacyAuthStorage";

let isInitialized = false;

export function initializeSessionCoordinator() {
  purgeLegacyAuthStorage();
  if (isInitialized) {
    return;
  }
  isInitialized = true;
  registerUnauthorizedHandler("user", handleUnauthorizedSession);
  window.addEventListener("storage", (event) => {
    if (
      event.key !== "mobile-messenger.logout-pending.v1" ||
      (!event.newValue?.startsWith("pending") &&
        !event.oldValue?.startsWith("pending"))
    )
      return;
    clearFeatureState();
    authStore.getState().observeLogoutReceipt(event.newValue);
  });
}

export async function logoutUserSession() {
  // Start the receipt before clearing views or making any other network call.
  const revocation = authStore.getState().logout();
  clearFeatureState();
  void pushStore
    .getState()
    .detachFromCurrentSession()
    .catch(() => undefined);
  try {
    await revocation;
    return true;
  } catch {
    return false;
  }
}

export function handleUnauthorizedSession(message: string) {
  clearFeatureState();
  authStore.getState().handleUnauthorized(message);
}

function clearFeatureState() {
  realtimeStore.getState().clear();
  chatStore.getState().clear();
  locationStore.getState().clear();
}
