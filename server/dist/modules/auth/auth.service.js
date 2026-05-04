"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const phone_verification_code_entity_1 = require("../../entities/phone-verification-code.entity");
const telegram_link_entity_1 = require("../../entities/telegram-link.entity");
const user_entity_1 = require("../../entities/user.entity");
const contact_utils_1 = require("../common/contact.utils");
const runtime_config_1 = require("../common/runtime-config");
const auth_rate_limit_service_1 = require("./auth-rate-limit.service");
const sms_types_1 = require("./sms/sms.types");
let AuthService = AuthService_1 = class AuthService {
    constructor(usersRepository, verificationCodesRepository, telegramLinksRepository, jwtService, authRateLimitService, smsService) {
        this.usersRepository = usersRepository;
        this.verificationCodesRepository = verificationCodesRepository;
        this.telegramLinksRepository = telegramLinksRepository;
        this.jwtService = jwtService;
        this.authRateLimitService = authRateLimitService;
        this.smsService = smsService;
        this.logger = new common_1.Logger(AuthService_1.name);
        this.codeTTLSeconds = (0, runtime_config_1.getAuthCodeTTLSeconds)();
        this.codeMaxAttempts = (0, runtime_config_1.getAuthCodeMaxAttempts)();
        this.resendCooldownSeconds = (0, runtime_config_1.getAuthCodeResendCooldownSeconds)();
        this.demoAccounts = [
            {
                method: user_entity_1.AuthMethod.PHONE,
                contact: "+15551230011",
                displayName: "Анна Demo",
                password: "demo1111",
            },
            {
                method: user_entity_1.AuthMethod.PHONE,
                contact: "+15551230012",
                displayName: "Борис Demo",
                password: "demo2222",
            },
            {
                method: user_entity_1.AuthMethod.PHONE,
                contact: "+15551230013",
                displayName: "Вера Demo",
                password: "demo3333",
            },
            {
                method: user_entity_1.AuthMethod.PHONE,
                contact: "+15551230014",
                displayName: "Глеб Demo",
                password: "demo4444",
            },
            {
                method: user_entity_1.AuthMethod.PHONE,
                contact: "+15551230015",
                displayName: "Даша Demo",
                password: "demo5555",
            },
        ];
    }
    async onModuleInit() {
        if (!(0, runtime_config_1.areDemoAccountsEnabled)()) {
            return;
        }
        for (const account of this.demoAccounts) {
            await this.findOrCreateUser(account.method, account.contact, account.displayName, undefined, true);
        }
    }
    async requestCode(dto, requestContext) {
        const phone = this.resolvePhone(dto);
        this.authRateLimitService.consume(`request:phone:${phone}`, {
            maxRequests: (0, runtime_config_1.getPhoneRequestRateLimitMaxRequests)(),
            windowMs: (0, runtime_config_1.getAuthRateLimitWindowMs)(),
            message: "Too many auth requests for this phone number",
        });
        const activeCode = await this.findLatestCode(phone);
        const now = new Date();
        if (activeCode &&
            !activeCode.consumedAt &&
            activeCode.resendAvailableAt.getTime() > now.getTime()) {
            throw new common_1.HttpException(`Resend cooldown active. Try again in ${Math.ceil((activeCode.resendAvailableAt.getTime() - now.getTime()) / 1000)} seconds`, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const code = this.generateVerificationCode();
        const codeEntity = this.verificationCodesRepository.create({
            phone,
            codeHash: this.hashVerificationCode(phone, code),
            expiresAt: new Date(now.getTime() + this.codeTTLSeconds * 1000),
            attempts: 0,
            consumedAt: null,
            resendAvailableAt: new Date(now.getTime() + this.resendCooldownSeconds * 1000),
            requestIP: requestContext?.requestIP ?? null,
            userAgent: requestContext?.userAgent ?? null,
        });
        await this.verificationCodesRepository.save(codeEntity);
        try {
            await this.smsService.sendVerificationCode(phone, code);
        }
        catch (error) {
            await this.verificationCodesRepository.delete({ id: codeEntity.id });
            if (error instanceof sms_types_1.TelegramNotLinkedError) {
                throw new common_1.HttpException({
                    code: error.code,
                    message: error.message,
                }, common_1.HttpStatus.BAD_REQUEST);
            }
            if (error instanceof sms_types_1.SmsProviderUnavailableError) {
                throw new common_1.ServiceUnavailableException("Verification provider unavailable");
            }
            this.logger.error(`Failed to deliver verification code for ${phone}`, error);
            throw new common_1.ServiceUnavailableException("Verification provider unavailable");
        }
        return {
            status: "code_sent",
            delivery: (0, runtime_config_1.getVerificationProvider)(),
            resendAfterSeconds: this.resendCooldownSeconds,
            expiresIn: this.codeTTLSeconds,
            ...((0, runtime_config_1.shouldExposeDebugAuthCode)() ? { debugCode: code } : {}),
        };
    }
    async verifyCode(dto) {
        const phone = this.resolvePhone(dto);
        const verificationCode = await this.findLatestCode(phone);
        if (!verificationCode) {
            throw new common_1.UnauthorizedException("Invalid verification code");
        }
        if (verificationCode.consumedAt) {
            throw new common_1.UnauthorizedException("Verification code has already been used");
        }
        if (verificationCode.expiresAt.getTime() < Date.now()) {
            throw new common_1.UnauthorizedException("Verification code expired");
        }
        if (verificationCode.attempts >= this.codeMaxAttempts) {
            throw new common_1.HttpException("Too many verification attempts", common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const submittedCode = dto.code.trim();
        if (this.hashVerificationCode(phone, submittedCode) !==
            verificationCode.codeHash) {
            verificationCode.attempts += 1;
            await this.verificationCodesRepository.save(verificationCode);
            if (verificationCode.attempts >= this.codeMaxAttempts) {
                throw new common_1.HttpException("Too many verification attempts", common_1.HttpStatus.TOO_MANY_REQUESTS);
            }
            throw new common_1.UnauthorizedException("Invalid verification code");
        }
        verificationCode.consumedAt = new Date();
        await this.verificationCodesRepository.save(verificationCode);
        const telegramLink = await this.telegramLinksRepository.findOne({
            where: {
                phone,
                revokedAt: (0, typeorm_2.IsNull)(),
            },
        });
        const user = await this.findOrCreateUser(user_entity_1.AuthMethod.PHONE, phone, this.findDemoAccount(user_entity_1.AuthMethod.PHONE, phone)?.displayName, telegramLink ?? undefined);
        return this.buildAuthResult(user);
    }
    async login(dto) {
        if (!(0, runtime_config_1.areDemoAccountsEnabled)() || !(0, runtime_config_1.isPasswordLoginEnabled)()) {
            throw new common_1.ForbiddenException("Password login is disabled");
        }
        const normalizedMethod = dto.method ?? user_entity_1.AuthMethod.PHONE;
        const normalizedContact = this.resolveContact(dto);
        const demoAccount = this.findDemoAccount(normalizedMethod, normalizedContact);
        const password = dto.password.trim();
        if (!demoAccount || password !== demoAccount.password) {
            throw new common_1.UnauthorizedException("Invalid demo credentials");
        }
        const user = await this.findOrCreateUser(normalizedMethod, normalizedContact, demoAccount.displayName);
        return this.buildAuthResult(user);
    }
    async getMe(userID) {
        const user = await this.usersRepository.findOneBy({
            id: userID,
        });
        if (!user) {
            throw new common_1.BadRequestException("User not found");
        }
        return {
            userID: user.id,
            displayName: user.displayName,
            contact: user.contact,
            method: user.method,
            phone: user.phone,
            telegramChatId: user.telegramChatId,
            telegramUsername: user.telegramUsername,
        };
    }
    findDemoAccount(method, contact) {
        return this.demoAccounts.find((account) => account.method === method && account.contact === contact);
    }
    async findOrCreateUser(method, contact, preferredDisplayName, telegramLink, syncExistingDisplayName = false) {
        let user = await this.findUserByMethodAndContact(method, contact);
        const displayName = preferredDisplayName ?? (0, contact_utils_1.buildDisplayName)(method, contact);
        if (!user) {
            try {
                user = this.usersRepository.create({
                    method,
                    contact,
                    phone: method === user_entity_1.AuthMethod.PHONE ? contact : null,
                    telegramChatId: telegramLink?.chatId ?? null,
                    telegramUsername: telegramLink?.username ?? null,
                    displayName,
                });
                return await this.usersRepository.save(user);
            }
            catch {
                const existingUser = await this.findUserByMethodAndContact(method, contact);
                if (existingUser) {
                    user = existingUser;
                }
                else {
                    throw new common_1.BadRequestException("Failed to create user");
                }
            }
        }
        let shouldSave = false;
        if (method === user_entity_1.AuthMethod.PHONE && user.phone !== contact) {
            user.phone = contact;
            shouldSave = true;
        }
        if (syncExistingDisplayName &&
            preferredDisplayName &&
            user.displayName !== preferredDisplayName) {
            user.displayName = preferredDisplayName;
            shouldSave = true;
        }
        if (telegramLink) {
            if (user.telegramChatId !== telegramLink.chatId) {
                user.telegramChatId = telegramLink.chatId;
                shouldSave = true;
            }
            if (user.telegramUsername !== telegramLink.username) {
                user.telegramUsername = telegramLink.username;
                shouldSave = true;
            }
        }
        if (shouldSave) {
            return this.usersRepository.save(user);
        }
        return user;
    }
    findUserByMethodAndContact(method, contact) {
        if (method === user_entity_1.AuthMethod.PHONE) {
            return this.findPhoneUser(contact);
        }
        return this.usersRepository.findOneBy({ method, contact });
    }
    async findPhoneUser(contact) {
        const userByPhone = await this.usersRepository.findOneBy({
            method: user_entity_1.AuthMethod.PHONE,
            phone: contact,
        });
        if (userByPhone) {
            return userByPhone;
        }
        return this.usersRepository.findOneBy({
            method: user_entity_1.AuthMethod.PHONE,
            contact,
        });
    }
    async buildAuthResult(user) {
        const token = await this.jwtService.signAsync({
            sub: user.id,
            displayName: user.displayName,
            contact: user.contact,
            method: user.method,
            phone: user.phone ?? user.contact,
        }, {
            secret: (0, runtime_config_1.getJwtSecret)(),
            expiresIn: (0, runtime_config_1.getJwtExpiresIn)(),
        });
        return {
            token,
            userID: user.id,
            displayName: user.displayName,
            phone: user.phone ?? user.contact,
        };
    }
    generateVerificationCode() {
        if ((0, runtime_config_1.isTestCodeAllowed)()) {
            return (0, runtime_config_1.getAuthTestCode)();
        }
        return String((0, node_crypto_1.randomInt)(100000, 999999));
    }
    resolvePhone(dto) {
        const method = dto.method ?? user_entity_1.AuthMethod.PHONE;
        if (method !== user_entity_1.AuthMethod.PHONE) {
            throw new common_1.BadRequestException("Only phone authentication is supported");
        }
        return (0, contact_utils_1.normalizePhone)(dto.phone ?? dto.contact ?? "");
    }
    resolveContact(dto) {
        const method = dto.method ?? user_entity_1.AuthMethod.PHONE;
        const contact = dto.phone ?? dto.contact ?? "";
        return (0, contact_utils_1.normalizeContact)(method, contact);
    }
    hashVerificationCode(phone, code) {
        return (0, node_crypto_1.createHmac)("sha256", (0, runtime_config_1.getJwtSecret)())
            .update(`${phone}:${code}`)
            .digest("hex");
    }
    findLatestCode(phone) {
        return this.verificationCodesRepository.findOne({
            where: { phone },
            order: { createdAt: "DESC" },
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(phone_verification_code_entity_1.PhoneVerificationCodeEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(telegram_link_entity_1.TelegramLinkEntity)),
    __param(5, (0, common_1.Inject)(sms_types_1.SMS_SERVICE)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        jwt_1.JwtService,
        auth_rate_limit_service_1.AuthRateLimitService, Object])
], AuthService);
//# sourceMappingURL=auth.service.js.map