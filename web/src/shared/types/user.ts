import type { AuthMethod } from "@/features/auth/types/auth";

export type UserContact = {
  userID: string;
  displayName: string;
  contact: string;
  method: AuthMethod;
  isCurrentUser: boolean;
};
