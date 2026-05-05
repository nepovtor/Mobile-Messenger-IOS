export type AdminCredentials = {
  login: string;
  password: string;
};

export type CurrentAdmin = {
  login: string;
  role: "admin";
  displayName: string;
};

export type AdminAuthResponse = {
  token: string;
  admin: CurrentAdmin;
  expiresIn: string;
};
