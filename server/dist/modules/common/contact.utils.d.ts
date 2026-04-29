import { AuthMethod } from "../../entities/user.entity";
export declare function normalizePhone(phone: string): string;
export declare function normalizeContact(method: AuthMethod, contact: string): string;
export declare function buildDisplayName(method: AuthMethod, contact: string): string;
