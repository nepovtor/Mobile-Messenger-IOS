import { httpRequest } from "@/shared/api/httpClient";
import { apiPath } from "@/shared/api/generated/apiContract";

export type ProfileUpdateResponse = {
  userID: string;
  displayName: string;
  phone: string;
};

export const profileApi = {
  updateProfile(displayName: string) {
    return httpRequest<ProfileUpdateResponse>(apiPath("updateProfile"), {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    });
  },
};
