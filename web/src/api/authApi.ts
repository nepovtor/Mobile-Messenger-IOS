import type {
  AuthCodeResponse,
  AuthResponse,
  CurrentUser,
  LoginPayload,
} from "../types/auth";
import { httpRequest } from "./httpClient";

export const authApi = {
  async requestCode(phone: string) {
    const payload = await httpRequest<Partial<AuthCodeResponse>>("/auth/request", {
      method: "POST",
      body: JSON.stringify({
        method: "phone",
        contact: phone,
      }),
    });

    return {
      status: "code_sent",
      delivery: payload.delivery ?? "telegram",
      resendAfterSeconds: payload.resendAfterSeconds ?? 60,
      expiresIn: payload.expiresIn ?? 300,
      debugCode: payload.debugCode,
    } satisfies AuthCodeResponse;
  },
  verifyCode(phone: string, code: string) {
    return httpRequest<AuthResponse>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({
        method: "phone",
        contact: phone,
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
