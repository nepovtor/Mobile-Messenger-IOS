import { AuthenticatedUser } from "../common/authenticated-user";
import { AuthService } from "./auth.service";
import { LoginAuthDto } from "./dto/login-auth.dto";
import { RequestAuthDto } from "./dto/request-auth.dto";
import { VerifyAuthDto } from "./dto/verify-auth.dto";
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    requestCode(dto: RequestAuthDto): Promise<{
        expiresIn: number;
        debugCode?: string;
    }>;
    verifyCode(dto: VerifyAuthDto): Promise<{
        token: string;
        userID: string;
        displayName: string;
    }>;
    login(dto: LoginAuthDto): Promise<{
        token: string;
        userID: string;
        displayName: string;
    }>;
    getMe(user: AuthenticatedUser): Promise<{
        userID: string;
        displayName: string;
        contact: string;
        method: string;
    }>;
    listContacts(user: AuthenticatedUser): Promise<{
        userID: string;
        displayName: string;
        contact: string;
        method: import("../../entities/user.entity").AuthMethod;
        isCurrentUser: boolean;
    }[]>;
}
