import { OnModuleInit } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Repository } from "typeorm";
import { PhoneVerificationCodeEntity } from "../../entities/phone-verification-code.entity";
import { TelegramLinkEntity } from "../../entities/telegram-link.entity";
import { AuthMethod, UserEntity } from "../../entities/user.entity";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { LoginAuthDto } from "./dto/login-auth.dto";
import { RequestAuthDto } from "./dto/request-auth.dto";
import { VerifyAuthDto } from "./dto/verify-auth.dto";
import { SmsService } from "./sms/sms.types";
type AuthResult = {
    token: string;
    userID: string;
    displayName: string;
    phone: string;
};
export declare class AuthService implements OnModuleInit {
    private readonly usersRepository;
    private readonly verificationCodesRepository;
    private readonly telegramLinksRepository;
    private readonly jwtService;
    private readonly authRateLimitService;
    private readonly smsService;
    private readonly logger;
    private readonly codeTTLSeconds;
    private readonly codeMaxAttempts;
    private readonly resendCooldownSeconds;
    private readonly demoAccounts;
    constructor(usersRepository: Repository<UserEntity>, verificationCodesRepository: Repository<PhoneVerificationCodeEntity>, telegramLinksRepository: Repository<TelegramLinkEntity>, jwtService: JwtService, authRateLimitService: AuthRateLimitService, smsService: SmsService);
    onModuleInit(): Promise<void>;
    requestCode(dto: RequestAuthDto, requestContext?: {
        requestIP?: string | null;
        userAgent?: string | null;
    }): Promise<{
        status: "code_sent";
        delivery: string;
        resendAfterSeconds: number;
        expiresIn: number;
        debugCode?: string;
    }>;
    verifyCode(dto: VerifyAuthDto): Promise<{
        token: string;
        userID: string;
        displayName: string;
        phone: string;
    }>;
    login(dto: LoginAuthDto): Promise<AuthResult>;
    getMe(userID: string): Promise<{
        userID: string;
        displayName: string;
        contact: string;
        method: string;
        phone: string | null;
        telegramChatId: string | null;
        telegramUsername: string | null;
    }>;
    listContacts(userID: string): Promise<Array<{
        userID: string;
        displayName: string;
        contact: string;
        method: AuthMethod;
        phone: string | null;
        isCurrentUser: boolean;
    }>>;
    private findDemoAccount;
    private findOrCreateUser;
    private buildAuthResult;
    private generateVerificationCode;
    private resolvePhone;
    private resolveContact;
    private hashVerificationCode;
    private findLatestCode;
}
export {};
