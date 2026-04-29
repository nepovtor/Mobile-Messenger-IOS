import { AuthMethod } from "../../../entities/user.entity";
export declare class VerifyAuthDto {
    method?: AuthMethod;
    contact?: string;
    phone?: string;
    code: string;
}
