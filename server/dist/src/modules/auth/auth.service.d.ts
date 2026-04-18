import { JwtService } from "@nestjs/jwt";
import { Repository } from "typeorm";
import { User } from "../../entities/user.entity";
import { RequestCodeDto } from "./dto/request-code.dto";
import { LoginAuthDto } from "./dto/login-auth.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { VerifyCodeDto } from "./dto/verify-code.dto";
export declare class AuthService {
    private readonly userRepository;
    private readonly jwtService;
    private readonly logger;
    constructor(userRepository: Repository<User>, jwtService: JwtService);
    requestCode({ method, contact }: RequestCodeDto): Promise<{
        expiresIn: number;
    }>;
    verifyCode({ method, contact, code, displayName }: VerifyCodeDto): Promise<{
        token: string;
        userID: string;
        displayName: string;
        phone: string;
    }>;
    login({ method, contact, password }: LoginAuthDto): Promise<{
        token: string;
        userID: string;
        displayName: string;
        phone: string;
    }>;
    getCurrentUser(userID: string): Promise<{
        userID: string;
        displayName: string;
        phone: string;
    }>;
    listContacts(userID: string): Promise<{
        userID: string;
        displayName: string;
        contact: string;
        isCurrentUser: boolean;
    }[]>;
    updateProfile(userID: string, { displayName }: UpdateProfileDto): Promise<{
        userID: string;
        displayName: string;
        phone: string;
    }>;
    private normalizeDisplayName;
    private requireUser;
    private createSessionResponse;
    private ensureDemoAccounts;
    private findOrCreateUser;
}
