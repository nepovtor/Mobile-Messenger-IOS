import { httpRequest } from "@/shared/api/httpClient";
import { apiPath } from "@/shared/api/generated/apiContract";
import type {
  AdminAuthResponse,
  AdminCredentials,
  CurrentAdmin,
} from "@/features/admin/types/admin";

export const adminApi = {
  login(payload: AdminCredentials) {
    return httpRequest<AdminAuthResponse>(apiPath("adminLogin"), {
      method: "POST",
      authMode: "none",
      body: JSON.stringify(payload),
    });
  },

  logout() {
    return httpRequest<void>("/admin/logout", {
      method: "POST",
      authMode: "none",
    });
  },

  getMe() {
    return httpRequest<CurrentAdmin>(apiPath("adminMe"), {
      authMode: "admin",
    });
  },
};
