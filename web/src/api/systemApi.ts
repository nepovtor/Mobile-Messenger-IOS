import { httpRequest } from "./httpClient";
import type {
  BackendHealthInfo,
  BackendVersionInfo,
  SystemLogEntry,
  SystemOverview,
} from "../types/system";

export const systemApi = {
  getOverview() {
    return httpRequest<SystemOverview>("/system/overview", {
      authMode: "admin",
    });
  },

  getRequestLogs(limit = 20) {
    return httpRequest<SystemLogEntry[]>(
      `/system/logs/requests?limit=${limit}`,
      {
        authMode: "admin",
      },
    );
  },

  getErrorLogs(limit = 20) {
    return httpRequest<SystemLogEntry[]>(
      `/system/logs/errors?limit=${limit}`,
      {
        authMode: "admin",
      },
    );
  },

  getVersion() {
    return httpRequest<BackendVersionInfo>("/version", {
      authMode: "none",
    });
  },

  getHealth() {
    return httpRequest<BackendHealthInfo>("/health", {
      authMode: "none",
    });
  },
};
