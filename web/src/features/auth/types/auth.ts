export type AuthMethod = "phone" | "email";

export type LoginPayload = {
  method: AuthMethod;
  contact: string;
  password: string;
};

export type AuthResponse = {
  userID: string;
  displayName: string;
  phone: string;
  /**
   * Transitional response field used by the pre-cookie production backend.
   * It is kept in memory only and is never written to browser storage.
   */
  token?: string;
};

export type CurrentUser = {
  userID: string;
  displayName: string;
  contact: string;
  method: AuthMethod;
  phone?: string | null;
};

export type AuthCodeResponse = {
  status: "code_sent";
  delivery: "telegram" | "console" | "mock" | "sms";
  resendAfterSeconds: number;
  expiresIn: number;
  debugCode?: string;
};

export type TelegramPairingResponse = {
  botUsername: string;
  telegramStartUrl: string;
  expiresIn: number;
};
