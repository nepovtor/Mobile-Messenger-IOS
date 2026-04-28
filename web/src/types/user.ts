import type { AuthMethod } from "./auth";

export type UserContact = {
  userID: string;
  displayName: string;
  contact: string;
  method: AuthMethod;
  isCurrentUser: boolean;
};
