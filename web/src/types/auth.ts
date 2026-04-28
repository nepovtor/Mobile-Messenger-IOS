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
};

export type CurrentUser = {
  userID: string;
  displayName: string;
  contact: string;
  method: AuthMethod;
};

export type AuthCodeResponse = {
  expiresIn: number;
  debugCode?: string;
};
