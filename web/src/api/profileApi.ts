import { httpRequest } from "./httpClient";

export type ProfileUpdateResponse = {
  userID: string;
  displayName: string;
  phone: string;
};

export const profileApi = {
  updateProfile(displayName: string) {
    return httpRequest<ProfileUpdateResponse>("/users/me/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    });
  },
};
