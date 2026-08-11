let legacyAccessToken: string | null = null;

export function setLegacyAccessToken(token: string | null | undefined) {
  const normalized = token?.trim();
  legacyAccessToken = normalized || null;
}

export function getLegacyAccessToken() {
  return legacyAccessToken;
}

export function clearLegacyAccessToken() {
  legacyAccessToken = null;
}
