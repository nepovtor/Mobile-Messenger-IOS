import { httpRequest } from "./httpClient";

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
    return httpRequest<MyLocationShare>("/location/me");
  },
  updateMyLocation(payload: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    sharingEnabled: boolean;
  }) {
    return httpRequest<MyLocationShare>("/location/me", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  stopSharing() {
    return httpRequest<{ ok: true }>("/location/me", {
      method: "DELETE",
    });
  },
  getContactLocations() {
    return httpRequest<ContactLocation[]>("/location/contacts");
  },
};
