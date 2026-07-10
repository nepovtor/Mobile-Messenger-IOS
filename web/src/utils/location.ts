import { ApiError } from "@/shared/api/httpClient";

export function mapLocationErrorMessage(
  error: unknown,
  fallback = "Could not complete the location request.",
) {
  if (
    typeof GeolocationPositionError !== "undefined" &&
    error instanceof GeolocationPositionError
  ) {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return "Location permission was denied in the browser.";
      case error.POSITION_UNAVAILABLE:
        return "Current location is unavailable right now.";
      case error.TIMEOUT:
        return "Location request timed out. Please try again.";
      default:
        break;
    }
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function formatLocationUpdatedAt(value: string | null) {
  if (!value) {
    return "Updated recently";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Updated recently";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
