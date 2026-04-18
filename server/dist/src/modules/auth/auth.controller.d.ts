import { AuthenticatedRequest } from "../../auth.types";
import { AuthService } from "./auth.service";
import { LoginAuthDto } from "./dto/login-auth.dto";
import { RequestCodeDto } from "./dto/request-code.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { VerifyCodeDto } from "./dto/verify-code.dto";
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    requestCode(body: RequestCodeDto): Promise<{
        expiresIn: number;
    }>;
    verifyCode(body: VerifyCodeDto): Promise<{
        token: string;
        userID: string;
        displayName: string;
        phone: string;
    }>;
    login(body: LoginAuthDto): Promise<{
        token: string;
        userID: string;
        displayName: string;
        phone: string;
    }>;
    getCurrentUser(request: AuthenticatedRequest): Promise<{
        userID: string;
        displayName: string;
        phone: string;
    }>;
    listContacts(request: AuthenticatedRequest): Promise<{
        userID: string;
        displayName: string;
        contact: string;
        isCurrentUser: boolean;
    }[]>;
    updateProfile(body: UpdateProfileDto, request: AuthenticatedRequest): Promise<{
        userID: string;
        displayName: string;
        phone: string;
    }>;
}
