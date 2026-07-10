import { registerUnauthorizedHandler } from "@/shared/api/httpClient";
import { authStore } from "@/features/auth/model/authStore";
import { chatStore } from "@/features/chat/model/chatStore";
import { realtimeStore } from "@/features/chat/model/realtimeStore";
import { locationStore } from "@/features/location/model/locationStore";
import { pushStore } from "@/features/push/model/pushStore";

let isInitialized = false;

export function initializeSessionCoordinator() {
  if (isInitialized) {
    return;
  }
  isInitialized = true;
  registerUnauthorizedHandler("user", handleUnauthorizedSession);
}

export async function logoutUserSession() {
  await pushStore.getState().detachFromCurrentSession();
  clearFeatureState();
  authStore.getState().logout();
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
