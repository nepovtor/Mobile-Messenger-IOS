import { Request } from "express";

export interface JwtPayload {
  sub: string;
  phone: string;
  displayName: string;
}

export type AuthenticatedRequest = Request & {
  user: JwtPayload;
};
