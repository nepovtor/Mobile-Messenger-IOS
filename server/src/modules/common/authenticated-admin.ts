export interface AuthenticatedAdmin {
  sub: string;
  login: string;
  role: "admin";
  displayName: string;
}
