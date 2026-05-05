import { httpRequest } from "./httpClient";
import type {
  BackendHealthInfo,
  BackendVersionInfo,
  SystemLogEntry,
  SystemOverview,
} from "../types/system";

export const systemApi = {
  getOverview() {
    return httpRequest<SystemOverview>("/system/overview");
  },

  getRequestLogs(limit = 20) {
    return httpRequest<SystemLogEntry[]>(`/system/logs/requests?limit=${limit}`);
  },

  getErrorLogs(limit = 20) {
    return httpRequest<SystemLogEntry[]>(`/system/logs/errors?limit=${limit}`);
  },

  getVersion() {
    return httpRequest<BackendVersionInfo>("/version");
  },

  getHealth() {
    return httpRequest<BackendHealthInfo>("/health");
  },
};
