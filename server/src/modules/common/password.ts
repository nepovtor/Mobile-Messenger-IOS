import { argon2id, hash as argon2Hash, verify as argon2Verify } from "argon2";

const MINIMUM_PASSWORD_LENGTH = 14;
const MAXIMUM_PASSWORD_LENGTH = 256;

const COMPROMISED_PASSWORDS = new Set([
  "adminadminadmin",
  "passwordpassword",
  "qwertyqwertyqwerty",
  "letmeinletmein",
  "changemechangeme",
]);

export function validateAdministrativePassword(password: string): void {
  const length = Array.from(password).length;
  if (length < MINIMUM_PASSWORD_LENGTH || length > MAXIMUM_PASSWORD_LENGTH) {
    throw new Error(
      `Administrative passwords must contain ${MINIMUM_PASSWORD_LENGTH}-${MAXIMUM_PASSWORD_LENGTH} characters`,
    );
  }

  const normalized = password.toLowerCase().replaceAll(/\s+/g, "");
  if (COMPROMISED_PASSWORDS.has(normalized)) {
    throw new Error("Administrative password is too common");
  }

  const characterClasses = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (characterClasses < 3) {
    throw new Error(
      "Administrative password must use at least three character classes",
    );
  }
}

export function hashAdministrativePassword(password: string): Promise<string> {
  validateAdministrativePassword(password);
  return argon2Hash(password, {
    type: argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
  });
}

export async function verifyAdministrativePassword(
  encodedHash: string,
  password: string,
): Promise<boolean> {
  if (!encodedHash.startsWith("$argon2id$")) {
    return false;
  }

  try {
    return await argon2Verify(encodedHash, password);
  } catch {
    return false;
  }
}
