import { AuthMethod } from "../../entities/user.entity";

export interface AuthenticatedUser {
  sub: string;
  displayName: string;
  contact: string;
  method: AuthMethod;
  phone: string;
}
