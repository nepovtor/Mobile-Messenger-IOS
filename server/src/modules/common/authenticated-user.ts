import { AuthMethod } from "../../entities/user.entity";

export interface AuthenticatedUser {
  sub: string;
  login: string;
  displayName: string;
  contact: string;
  method: AuthMethod;
  phone: string;
}
