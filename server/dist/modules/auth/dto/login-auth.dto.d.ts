import { AuthMethod } from "../../../entities/user.entity";
export declare class LoginAuthDto {
    method: AuthMethod;
    contact: string;
    password: string;
}
