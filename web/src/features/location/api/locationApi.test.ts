import { beforeEach, describe, expect, it, vi } from "vitest";
import { locationApi } from "@/features/location/api/locationApi";

describe("locationApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps the update location payload", async () => {
    const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sharingEnabled: true,
          latitude: 53.9,
          longitude: 27.56,
          accuracy: 25,
          updatedAt: "2026-05-02T09:00:00.000Z",
        }),
        { status: 200 },
      ),
    );

    await locationApi.updateMyLocation({
      latitude: 53.9,
      longitude: 27.56,
      accuracy: 25,
      sharingEnabled: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/location/me"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          latitude: 53.9,
          longitude: 27.56,
          accuracy: 25,
          sharingEnabled: true,
        }),
      }),
    );
  });
});
