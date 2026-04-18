import { AuthenticatedRequest } from "../../auth.types";
import { AuthService } from "./auth.service";
import { RequestCodeDto } from "./dto/request-code.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { VerifyCodeDto } from "./dto/verify-code.dto";
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    requestCode(body: RequestCodeDto): Promise<{
        expiresIn: number;
        marker: string;
    }>;
    verifyCode(body: VerifyCodeDto): Promise<{
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
    updateProfile(body: UpdateProfileDto, request: AuthenticatedRequest): Promise<{
        userID: string;
        displayName: string;
        phone: string;
    }>;
}
