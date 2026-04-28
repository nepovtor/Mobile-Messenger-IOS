const TOKEN_KEY = "mobile-messenger.web.token";
const USER_KEY = "mobile-messenger.web.user";

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

export const storage = {
  getToken(): string | null {
    return getStorage()?.getItem(TOKEN_KEY) ?? null;
  },
  setToken(token: string) {
    getStorage()?.setItem(TOKEN_KEY, token);
  },
  clearToken() {
    getStorage()?.removeItem(TOKEN_KEY);
  },
  getUser() {
    const raw = getStorage()?.getItem(USER_KEY);
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
    getStorage()?.setItem(USER_KEY, JSON.stringify(user));
  },
  clearUser() {
    getStorage()?.removeItem(USER_KEY);
  },
  clearAll() {
    this.clearToken();
    this.clearUser();
  },
};
