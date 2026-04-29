import { BadRequestException } from "@nestjs/common";
import { AuthMethod } from "../../entities/user.entity";

const E164_LIKE_PHONE = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) {
    throw new BadRequestException("Phone number is required");
  }

  if (!trimmed.startsWith("+")) {
    throw new BadRequestException(
      "Phone number must be in international format and start with +",
    );
  }

  if (/[A-Za-z]/.test(trimmed)) {
    throw new BadRequestException("Phone number contains invalid characters");
  }

  const normalized = trimmed.replace(/[\s()-]/g, "");
  if (!/^\+\d+$/.test(normalized)) {
    throw new BadRequestException("Phone number contains invalid characters");
  }

  if (!E164_LIKE_PHONE.test(normalized)) {
    throw new BadRequestException(
      "Phone number must contain between 8 and 15 digits in international format",
    );
  }

  return normalized;
}

export function normalizeContact(method: AuthMethod, contact: string): string {
  const trimmed = contact.trim();
  if (!trimmed) {
    throw new BadRequestException("Contact is required");
  }

  if (method === AuthMethod.PHONE) {
    return normalizePhone(trimmed);
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
