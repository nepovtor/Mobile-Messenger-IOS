export type AuthMethod = "phone" | "email";

export type LoginPayload = {
  method: AuthMethod;
  contact: string;
  password: string;
};

export type AuthResponse = {
  token: string;
  userID: string;
  displayName: string;
  phone: string;
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
