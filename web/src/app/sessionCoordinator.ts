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
}

export async function logoutUserSession() {
  await pushStore.getState().detachFromCurrentSession();
  clearFeatureState();
  await authStore.getState().logout();
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
