// Generated from contracts/openapi.json. Do not edit manually.
export const apiOperations = {
  "adminLogin": "/admin/login",
  "adminMe": "/admin/me",
  "authLogin": "/auth/login",
  "authMe": "/auth/me",
  "authRequest": "/auth/request",
  "authTelegramPairing": "/auth/telegram/pairing",
  "authVerify": "/auth/verify",
  "confirmMediaUpload": "/media/{mediaID}/confirm",
  "createChat": "/chats",
  "createContact": "/contacts",
  "createUser": "/users",
  "deleteChat": "/chats/{chatID}",
  "deleteContact": "/contacts/{identifier}",
  "deleteMessage": "/chats/{chatID}/messages/{messageID}",
  "deletePushDevice": "/push/devices/{token}",
  "deletePushSubscription": "/push/subscriptions",
  "deletePushSubscriptionFallback": "/push/subscriptions/delete",
  "getMyLocation": "/location/me",
  "getPushStatus": "/push/status",
  "getVapidPublicKey": "/push/vapid-public-key",
  "health": "/health",
  "labLogin": "/login",
  "listChats": "/chats",
  "listContactLocations": "/location/contacts",
  "listContacts": "/contacts",
  "listMessages": "/chats/{chatID}/messages",
  "markMessageRead": "/chats/{chatID}/messages/{messageID}/read",
  "realtimeEvents": "/realtime/events",
  "registerPushDevice": "/push/devices",
  "registerPushSubscription": "/push/subscriptions",
  "requestMediaUpload": "/media/upload-url",
  "rootDocs": "/",
  "sendMessage": "/chats/{chatID}/messages",
  "setTyping": "/chats/{chatID}/typing",
  "stopLocationSharing": "/location/me",
  "systemErrorLogs": "/system/logs/errors",
  "systemOverview": "/system/overview",
  "systemRequestLogs": "/system/logs/requests",
  "testPush": "/push/test",
  "updateMessage": "/chats/{chatID}/messages/{messageID}",
  "updateMyLocation": "/location/me",
  "updateProfile": "/users/me/profile",
  "version": "/version",
} as const;

export type APIOperation = keyof typeof apiOperations;

export function apiPath(
  operation: APIOperation,
  parameters: Record<string, string> = {},
): string {
  return apiOperations[operation].replace(
    /\{([^}]+)\}/g,
    (_, name: string) =>
      encodeURIComponent(parameters[name] ?? "{" + name + "}"),
  );
}
