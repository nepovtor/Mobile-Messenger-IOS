export interface AuthenticatedAdmin {
  sub: string;
  sid: string;
  jti: string;
  login: string;
  role: "admin";
  displayName: string;
  sessionVersion: number;
  deviceUuid: string;
}
