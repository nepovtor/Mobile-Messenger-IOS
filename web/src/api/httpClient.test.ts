import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, httpRequest } from "./httpClient";

describe("httpRequest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "{}",
      }),
    );
  });

  it("normalizes raw internal server errors into a stable backend message", async () => {
    const warningSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () =>
          JSON.stringify({
            statusCode: 500,
            message: "Internal server error",
            error: "Internal Server Error",
          }),
      }),
    );

    await expect(
      httpRequest("/boom", {
        authMode: "none",
      }),
    ).rejects.toEqual(
      new ApiError("Backend is unavailable right now. Please try again.", 500),
    );

    expect(warningSpy).toHaveBeenCalled();
  });
});
