import type {
  AuthCodeResponse,
  AuthResponse,
  CurrentUser,
  LoginPayload,
  TelegramPairingResponse,
} from "../types/auth";
import { httpRequest } from "./httpClient";

export const authApi = {
  requestTelegramPairing(phone: string) {
    return httpRequest<TelegramPairingResponse>("/auth/telegram/pairing", {
      method: "POST",
      authMode: "none",
      body: JSON.stringify({
        phone,
      }),
    });
  },
  async requestCode(phone: string) {
    const payload = await httpRequest<Partial<AuthCodeResponse>>(
      "/auth/request",
      {
        method: "POST",
        authMode: "none",
        body: JSON.stringify({
          method: "phone",
          contact: phone,
        }),
      },
    );

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
      authMode: "none",
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
      authMode: "none",
      body: JSON.stringify(payload),
    });
  },
  getMe() {
    return httpRequest<CurrentUser>("/auth/me", {
      authMode: "user",
    });
  },
};
