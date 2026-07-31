import { httpRequest } from "@/shared/api/httpClient";
import { apiPath } from "@/shared/api/generated/apiContract";
import type {
  BackendHealthInfo,
  BackendVersionInfo,
  SystemLogEntry,
  SystemOverview,
} from "@/features/admin/types/system";

export const systemApi = {
  getOverview() {
    return httpRequest<SystemOverview>(apiPath("systemOverview"), {
      authMode: "admin",
    });
  },

  getRequestLogs(limit = 20) {
    return httpRequest<SystemLogEntry[]>(
      `${apiPath("systemRequestLogs")}?limit=${limit}`,
      {
        authMode: "admin",
      },
    );
  },

  getErrorLogs(limit = 20) {
    return httpRequest<SystemLogEntry[]>(
      `${apiPath("systemErrorLogs")}?limit=${limit}`,
      {
        authMode: "admin",
      },
    );
  },

  getVersion() {
    return httpRequest<BackendVersionInfo>(apiPath("version"), {
      authMode: "none",
    });
  },

  getHealth() {
    return httpRequest<BackendHealthInfo>(apiPath("health"), {
      authMode: "none",
    });
  },
};
