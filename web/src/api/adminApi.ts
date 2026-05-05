import { httpRequest } from "./httpClient";
import type {
  AdminAuthResponse,
  AdminCredentials,
  CurrentAdmin,
} from "../types/admin";

export const adminApi = {
  login(payload: AdminCredentials) {
    return httpRequest<AdminAuthResponse>("/admin/login", {
      method: "POST",
      authMode: "none",
      body: JSON.stringify(payload),
    });
  },

  getMe() {
    return httpRequest<CurrentAdmin>("/admin/me", {
      authMode: "admin",
    });
  },
};
