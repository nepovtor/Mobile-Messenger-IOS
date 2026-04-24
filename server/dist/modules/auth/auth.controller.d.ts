import type { Request } from "express";
import { AuthenticatedUser } from "../common/authenticated-user";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthService } from "./auth.service";
import { LoginAuthDto } from "./dto/login-auth.dto";
import { RequestAuthDto } from "./dto/request-auth.dto";
import { VerifyAuthDto } from "./dto/verify-auth.dto";
export declare class AuthController {
    private readonly authService;
    private readonly authRateLimitService;
    constructor(authService: AuthService, authRateLimitService: AuthRateLimitService);
    requestCode(request: Request, dto: RequestAuthDto): Promise<{
        expiresIn: number;
        debugCode?: string;
    }>;
    verifyCode(request: Request, dto: VerifyAuthDto): Promise<{
        token: string;
        userID: string;
        displayName: string;
    }>;
    login(request: Request, dto: LoginAuthDto): Promise<{
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
    private getRequestIP;
}
