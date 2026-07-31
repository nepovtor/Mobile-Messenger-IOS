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
  admin: CurrentAdmin;
  expiresIn: string;
};
