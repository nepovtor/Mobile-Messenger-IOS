import { ApiError } from "../api/httpClient";

export function validateContactPhone(phone: string): string | null {
  const trimmed = phone.trim();

  if (!trimmed) {
    return "Phone number is required.";
  }
  if (!trimmed.startsWith("+")) {
    return "Phone number must start with +.";
  }
  if (trimmed.length < 8) {
    return "Enter a valid phone number.";
  }

  return null;
}

export function mapContactErrorMessage(
  error: unknown,
  fallback = "Could not complete the contacts request.",
): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "USER_NOT_FOUND":
        return "User with this phone number was not found.";
      case "CANNOT_ADD_SELF":
        return "You cannot add yourself.";
      default:
        break;
    }
  }

  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    if (normalized.includes("already") && normalized.includes("contact")) {
      return "Contact already added.";
    }
    return error.message;
  }

  return fallback;
}
