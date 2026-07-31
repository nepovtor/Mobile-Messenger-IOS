import type {
  AuthCodeResponse,
  AuthResponse,
  CurrentUser,
  LoginPayload,
  TelegramPairingResponse,
} from "@/features/auth/types/auth";
import { httpRequest } from "@/shared/api/httpClient";
import { apiPath } from "@/shared/api/generated/apiContract";

export const authApi = {
  requestTelegramPairing(phone: string) {
    return httpRequest<TelegramPairingResponse>(
      apiPath("authTelegramPairing"),
      {
        method: "POST",
        authMode: "none",
        body: JSON.stringify({
          phone,
        }),
      },
    );
  },
  async requestCode(phone: string) {
    const payload = await httpRequest<Partial<AuthCodeResponse>>(
      apiPath("authRequest"),
      {
        method: "POST",
        authMode: "none",
        body: JSON.stringify({
          phone,
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
    return httpRequest<AuthResponse>(apiPath("authVerify"), {
      method: "POST",
      authMode: "none",
      body: JSON.stringify({
        phone,
        code,
      }),
    });
  },
  login(payload: LoginPayload) {
    return httpRequest<AuthResponse>(apiPath("authLogin"), {
      method: "POST",
      authMode: "none",
      body: JSON.stringify(payload),
    });
  },
  logout() {
    return httpRequest<void>("/auth/logout", {
      method: "POST",
      authMode: "none",
    });
  },
  getMe() {
    return httpRequest<CurrentUser>(apiPath("authMe"), {
      authMode: "user",
    });
  },
};
