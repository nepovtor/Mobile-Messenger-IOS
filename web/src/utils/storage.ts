const USER_TOKEN_KEY = "mobile-messenger.web.token";
const USER_KEY = "mobile-messenger.web.user";
const ADMIN_TOKEN_KEY = "mobile-messenger.web.admin.token";
const ADMIN_KEY = "mobile-messenger.web.admin.user";

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  const storage = window.localStorage;
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function"
  ) {
    return null;
  }
  return storage;
}

function createStorage(tokenKey: string, userKey: string) {
  return {
    getToken(): string | null {
      return getStorage()?.getItem(tokenKey) ?? null;
    },
    setToken(token: string) {
      getStorage()?.setItem(tokenKey, token);
    },
    clearToken() {
      getStorage()?.removeItem(tokenKey);
    },
    getUser() {
      const raw = getStorage()?.getItem(userKey);
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    },
    setUser(user: unknown) {
      getStorage()?.setItem(userKey, JSON.stringify(user));
    },
    clearUser() {
      getStorage()?.removeItem(userKey);
    },
    clearAll() {
      this.clearToken();
      this.clearUser();
    },
  };
}

export const storage = createStorage(USER_TOKEN_KEY, USER_KEY);
export const adminStorage = createStorage(ADMIN_TOKEN_KEY, ADMIN_KEY);
