import { create } from "zustand";
import {
  locationApi,
  type ContactLocation,
  type MyLocationShare,
} from "../api/locationApi";
import { mapLocationErrorMessage } from "../utils/location";

type LocationStore = {
  myLocation: MyLocationShare | null;
  contactLocations: ContactLocation[];
  isLoading: boolean;
  isSharing: boolean;
  isStopping: boolean;
  error: string | null;
  notice: string | null;
  loadLocations: () => Promise<void>;
  shareLocation: (payload: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  }) => Promise<void>;
  stopSharing: () => Promise<void>;
  clear: () => void;
  clearNotice: () => void;
  clearError: () => void;
};

export const locationStore = create<LocationStore>((set) => ({
  myLocation: null,
  contactLocations: [],
  isLoading: false,
  isSharing: false,
  isStopping: false,
  error: null,
  notice: null,
  async loadLocations() {
    set({ isLoading: true, error: null });
    try {
      const [myLocation, contactLocations] = await Promise.all([
        locationApi.getMyLocation(),
        locationApi.getContactLocations(),
      ]);
      set({
        myLocation,
        contactLocations,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: mapLocationErrorMessage(error, "Could not load the map data."),
      });
    }
  },
  async shareLocation(payload) {
    set({ isSharing: true, error: null, notice: null });
    try {
      const myLocation = await locationApi.updateMyLocation({
        ...payload,
        sharingEnabled: true,
      });
      const contactLocations = await locationApi.getContactLocations();
      set({
        myLocation,
        contactLocations,
        isSharing: false,
        error: null,
        notice:
          "Your location is shared only with your contacts while sharing is enabled.",
      });
    } catch (error) {
      set({
        isSharing: false,
        error: mapLocationErrorMessage(error, "Could not share location."),
      });
    }
  },
  async stopSharing() {
    set({ isStopping: true, error: null, notice: null });
    try {
      await locationApi.stopSharing();
      const [myLocation, contactLocations] = await Promise.all([
        locationApi.getMyLocation(),
        locationApi.getContactLocations(),
      ]);
      set({
        myLocation,
        contactLocations,
        isStopping: false,
        error: null,
        notice: "Location sharing stopped.",
      });
    } catch (error) {
      set({
        isStopping: false,
        error: mapLocationErrorMessage(
          error,
          "Could not stop location sharing.",
        ),
      });
    }
  },
  clear() {
    set({
      myLocation: null,
      contactLocations: [],
      isLoading: false,
      isSharing: false,
      isStopping: false,
      error: null,
      notice: null,
    });
  },
  clearNotice() {
    set({ notice: null });
  },
  clearError() {
    set({ error: null });
  },
}));
