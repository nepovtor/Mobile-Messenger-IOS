const LEGACY_AUTH_STORAGE_KEYS = [
  "mobile-messenger.web.token",
  "mobile-messenger.web.user",
  "mobile-messenger.web.admin.token",
  "mobile-messenger.web.admin.user",
] as const;

type RemovableStorage = {
  removeItem: (key: string) => void;
};

export function purgeLegacyAuthStorage(storage = getBrowserStorage()) {
  if (!storage) {
    return;
  }

  for (const key of LEGACY_AUTH_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable under hardened browser privacy settings.
    }
  }
}

function getBrowserStorage(): RemovableStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storage = window.localStorage as Partial<RemovableStorage>;
    return typeof storage?.removeItem === "function"
      ? (storage as RemovableStorage)
      : null;
  } catch {
    return null;
  }
}
