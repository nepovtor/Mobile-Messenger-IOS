import { BadRequestException } from "@nestjs/common";
import { AuthMethod } from "../../entities/user.entity";

export function normalizeContact(method: AuthMethod, contact: string): string {
  const trimmed = contact.trim();
  if (!trimmed) {
    throw new BadRequestException("Contact is required");
  }

  if (method === AuthMethod.PHONE) {
    const normalized = trimmed.replace(/[^+\d]/g, "");
    if (normalized.replace(/\D/g, "").length < 10) {
      throw new BadRequestException(
        "Phone number must contain at least 10 digits",
      );
    }
    return normalized;
  }

  const normalized = trimmed.toLowerCase();
  if (!normalized.includes("@")) {
    throw new BadRequestException("Email is invalid");
  }
  return normalized;
}

export function buildDisplayName(method: AuthMethod, contact: string): string {
  if (method === AuthMethod.EMAIL) {
    return contact.split("@")[0] || "User";
  }

  const digits = contact.replace(/\D/g, "");
  const suffix = digits.slice(-4) || "User";
  return `User ${suffix}`;
}
