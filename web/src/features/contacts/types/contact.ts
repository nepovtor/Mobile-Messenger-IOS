export type ContactEntry = {
  id: string;
  userID: string;
  displayName: string;
  phone: string;
  createdAt: string;
  directChatID: string | null;
  alreadyExists?: boolean;
};
