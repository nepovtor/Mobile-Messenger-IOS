import type {
  AuthCodeResponse,
  AuthResponse,
  CurrentUser,
  LoginPayload,
} from "../types/auth";
import { httpRequest } from "./httpClient";

export const authApi = {
  requestCode(phone: string) {
    return httpRequest<AuthCodeResponse>("/auth/request", {
      method: "POST",
      body: JSON.stringify({
        phone,
      }),
    });
  },
  verifyCode(phone: string, code: string) {
    return httpRequest<AuthResponse>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({
        phone,
        code,
      }),
    });
  },
  login(payload: LoginPayload) {
    return httpRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getMe() {
    return httpRequest<CurrentUser>("/auth/me");
  },
};
