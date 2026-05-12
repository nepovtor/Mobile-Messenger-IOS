import { Request } from "express";

export interface JwtPayload {
  sub: string;
  login: string;
  phone: string;
  displayName: string;
  contact: string;
  method: string;
}

export type AuthenticatedRequest = Request & {
  user: JwtPayload;
};
