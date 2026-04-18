import { OnModuleInit } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Repository } from "typeorm";
import { AuthMethod, UserEntity } from "../../entities/user.entity";
import { LoginAuthDto } from "./dto/login-auth.dto";
import { RequestAuthDto } from "./dto/request-auth.dto";
import { VerifyAuthDto } from "./dto/verify-auth.dto";
type AuthResult = {
    token: string;
    userID: string;
    displayName: string;
};
export declare class AuthService implements OnModuleInit {
    private readonly usersRepository;
    private readonly jwtService;
    private readonly verificationCodes;
    private readonly demoAccounts;
    constructor(usersRepository: Repository<UserEntity>, jwtService: JwtService);
    onModuleInit(): Promise<void>;
    requestCode(dto: RequestAuthDto): Promise<{
        expiresIn: number;
        debugCode?: string;
    }>;
    verifyCode(dto: VerifyAuthDto): Promise<{
        token: string;
        userID: string;
        displayName: string;
    }>;
    login(dto: LoginAuthDto): Promise<AuthResult>;
    getMe(userID: string): Promise<{
        userID: string;
        displayName: string;
        contact: string;
        method: string;
    }>;
    listContacts(userID: string): Promise<Array<{
        userID: string;
        displayName: string;
        contact: string;
        method: AuthMethod;
        isCurrentUser: boolean;
    }>>;
    private findDemoAccount;
    private findOrCreateUser;
    private buildAuthResult;
    private generateVerificationCode;
    private makeVerificationKey;
}
export {};
