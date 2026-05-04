import type { Request } from "express";
import { AuthenticatedUser } from "../common/authenticated-user";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthService } from "./auth.service";
import { LoginAuthDto } from "./dto/login-auth.dto";
import { RequestAuthDto } from "./dto/request-auth.dto";
import { RequestTelegramPairingDto } from "./dto/request-telegram-pairing.dto";
import { VerifyAuthDto } from "./dto/verify-auth.dto";
import { TelegramBotService } from "./telegram/telegram-bot.service";
export declare class AuthController {
    private readonly authService;
    private readonly authRateLimitService;
    private readonly telegramBotService;
    constructor(authService: AuthService, authRateLimitService: AuthRateLimitService, telegramBotService: TelegramBotService);
    requestCode(request: Request, dto: RequestAuthDto): Promise<{
        status: "code_sent";
        delivery: string;
        resendAfterSeconds: number;
        expiresIn: number;
        debugCode?: string;
    }>;
    verifyCode(request: Request, dto: VerifyAuthDto): Promise<{
        token: string;
        userID: string;
        displayName: string;
        phone: string;
    }>;
    login(request: Request, dto: LoginAuthDto): Promise<{
        token: string;
        userID: string;
        displayName: string;
        phone: string;
    }>;
    createTelegramPairing(request: Request, dto: RequestTelegramPairingDto): Promise<{
        botUsername: string;
        telegramStartUrl: string;
        expiresIn: number;
    }>;
    getMe(user: AuthenticatedUser): Promise<{
        userID: string;
        displayName: string;
        contact: string;
        method: string;
        phone: string | null;
        telegramChatId: string | null;
        telegramUsername: string | null;
    }>;
    private getRequestIP;
    private getUserAgent;
}
