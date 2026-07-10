import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/httpClient";
import {
  formatLocationUpdatedAt,
  mapLocationErrorMessage,
} from "@/utils/location";

describe("location utils", () => {
  it("maps api errors into readable location messages", () => {
    expect(
      mapLocationErrorMessage(
        new ApiError("Backend is unavailable right now."),
      ),
    ).toBe("Backend is unavailable right now.");
  });

  it("formats timestamps safely", () => {
    expect(formatLocationUpdatedAt("2026-05-02T09:00:00.000Z")).toMatch(
      /2026|May/,
    );
    expect(formatLocationUpdatedAt(null)).toBe("Updated recently");
  });
});
