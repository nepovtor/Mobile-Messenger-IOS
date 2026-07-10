import { describe, expect, it } from "vitest";
import { validateDisplayName } from "@/utils/displayName";

describe("validateDisplayName", () => {
  it("rejects empty names", () => {
    expect(validateDisplayName("   ")).toBe("Display name is required.");
  });

  it("rejects one-character names", () => {
    expect(validateDisplayName("A")).toBe(
      "Display name must be at least 2 characters.",
    );
  });

  it("rejects names longer than 40 characters", () => {
    expect(validateDisplayName("a".repeat(41))).toBe(
      "Display name must be 40 characters or fewer.",
    );
  });

  it("accepts a valid display name", () => {
    expect(validateDisplayName("Anna Reed")).toBeNull();
  });
});
