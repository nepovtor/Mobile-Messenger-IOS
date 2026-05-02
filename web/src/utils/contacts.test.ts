import { describe, expect, it } from "vitest";
import { ApiError } from "../api/httpClient";
import { mapContactErrorMessage } from "./contacts";

describe("mapContactErrorMessage", () => {
  it("maps USER_NOT_FOUND", () => {
    expect(
      mapContactErrorMessage(
        new ApiError(
          "User with this phone number was not found",
          404,
          "USER_NOT_FOUND",
        ),
      ),
    ).toBe("User with this phone number was not found.");
  });

  it("maps CANNOT_ADD_SELF", () => {
    expect(
      mapContactErrorMessage(
        new ApiError(
          "You cannot add yourself to contacts",
          400,
          "CANNOT_ADD_SELF",
        ),
      ),
    ).toBe("You cannot add yourself.");
  });

  it("keeps duplicate-friendly copy", () => {
    expect(
      mapContactErrorMessage(
        new Error("Contact already exists for this user."),
      ),
    ).toBe("Contact already added.");
  });
});
