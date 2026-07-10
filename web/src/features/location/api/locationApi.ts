import { httpRequest } from "@/shared/api/httpClient";
import { apiPath } from "@/shared/api/generated/apiContract";

export type MyLocationShare = {
  sharingEnabled: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  updatedAt: string | null;
};

export type ContactLocation = {
  userID: string;
  displayName: string;
  phone: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updatedAt: string;
  isOutdated: boolean;
};

export const locationApi = {
  getMyLocation() {
    return httpRequest<MyLocationShare>(apiPath("getMyLocation"));
  },
  updateMyLocation(payload: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    sharingEnabled: boolean;
  }) {
    return httpRequest<MyLocationShare>(apiPath("updateMyLocation"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  stopSharing() {
    return httpRequest<{ ok: true }>(apiPath("stopLocationSharing"), {
      method: "DELETE",
    });
  },
  getContactLocations() {
    return httpRequest<ContactLocation[]>(apiPath("listContactLocations"));
  },
};
