import { AuthMethod } from "../../entities/user.entity";

export interface AuthenticatedUser {
  sub: string;
  sid: string;
  jti: string;
  role: "user";
  sessionVersion: number;
  deviceUuid: string;
  login: string;
  displayName: string;
  contact: string;
  method: AuthMethod;
  phone: string;
}
