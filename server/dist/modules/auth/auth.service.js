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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../../entities/user.entity");
const contact_utils_1 = require("../common/contact.utils");
const runtime_config_1 = require("../common/runtime-config");
let AuthService = class AuthService {
    constructor(usersRepository, jwtService) {
        this.usersRepository = usersRepository;
        this.jwtService = jwtService;
        this.verificationCodes = new Map();
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
            await this.findOrCreateUser(account.method, account.contact, account.displayName);
        }
    }
    async requestCode(dto) {
        const normalizedContact = (0, contact_utils_1.normalizeContact)(dto.method, dto.contact);
        const expiresIn = 300;
        const debugCode = this.generateVerificationCode();
        this.verificationCodes.set(this.makeVerificationKey(dto.method, normalizedContact), {
            code: debugCode,
            expiresAt: Date.now() + expiresIn * 1000,
        });
        return {
            expiresIn,
            ...((0, runtime_config_1.shouldExposeDebugAuthCode)() ? { debugCode } : {}),
        };
    }
    async verifyCode(dto) {
        const normalizedContact = (0, contact_utils_1.normalizeContact)(dto.method, dto.contact);
        const demoAccount = this.findDemoAccount(dto.method, normalizedContact);
        const verificationKey = this.makeVerificationKey(dto.method, normalizedContact);
        const verificationCode = this.verificationCodes.get(verificationKey);
        if (!verificationCode ||
            verificationCode.expiresAt < Date.now() ||
            dto.code !== verificationCode.code) {
            throw new common_1.UnauthorizedException("Invalid verification code");
        }
        this.verificationCodes.delete(verificationKey);
        const user = await this.findOrCreateUser(dto.method, normalizedContact, demoAccount?.displayName);
        return this.buildAuthResult(user);
    }
    async login(dto) {
        if (!(0, runtime_config_1.areDemoAccountsEnabled)() || !(0, runtime_config_1.isPasswordLoginEnabled)()) {
            throw new common_1.ForbiddenException("Password login is disabled");
        }
        const normalizedContact = (0, contact_utils_1.normalizeContact)(dto.method, dto.contact);
        const demoAccount = this.findDemoAccount(dto.method, normalizedContact);
        const password = dto.password.trim();
        if (!demoAccount || password !== demoAccount.password) {
            throw new common_1.UnauthorizedException("Invalid demo credentials");
        }
        const user = await this.findOrCreateUser(dto.method, normalizedContact, demoAccount.displayName);
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
        };
    }
    async listContacts(userID) {
        await this.getMe(userID);
        const demoOrder = new Map(this.demoAccounts.map((account, index) => [account.contact, index]));
        const demoContacts = new Set(this.demoAccounts.map((account) => account.contact));
        const users = await this.usersRepository.find();
        return users
            .filter((user) => user.id === userID ||
            !(0, runtime_config_1.areDemoAccountsEnabled)() ||
            demoContacts.has(user.contact))
            .sort((left, right) => {
            if (left.id === userID) {
                return -1;
            }
            if (right.id === userID) {
                return 1;
            }
            const leftOrder = demoOrder.get(left.contact);
            const rightOrder = demoOrder.get(right.contact);
            if (leftOrder !== undefined &&
                rightOrder !== undefined &&
                leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }
            if (leftOrder !== undefined) {
                return -1;
            }
            if (rightOrder !== undefined) {
                return 1;
            }
            return left.displayName.localeCompare(right.displayName);
        })
            .map((user) => ({
            userID: user.id,
            displayName: user.displayName,
            contact: user.contact,
            method: user.method,
            isCurrentUser: user.id === userID,
        }));
    }
    findDemoAccount(method, contact) {
        return this.demoAccounts.find((account) => account.method === method && account.contact === contact);
    }
    async findOrCreateUser(method, contact, preferredDisplayName) {
        let user = await this.usersRepository.findOne({
            where: { method, contact },
        });
        const displayName = preferredDisplayName ?? (0, contact_utils_1.buildDisplayName)(method, contact);
        if (!user) {
            user = this.usersRepository.create({
                method,
                contact,
                displayName,
            });
            return this.usersRepository.save(user);
        }
        if (preferredDisplayName && user.displayName !== preferredDisplayName) {
            user.displayName = preferredDisplayName;
            return this.usersRepository.save(user);
        }
        return user;
    }
    async buildAuthResult(user) {
        const token = await this.jwtService.signAsync({
            sub: user.id,
            displayName: user.displayName,
            contact: user.contact,
            method: user.method,
        }, {
            secret: (0, runtime_config_1.getJwtSecret)(),
            expiresIn: "30d",
        });
        return {
            token,
            userID: user.id,
            displayName: user.displayName,
        };
    }
    generateVerificationCode() {
        return String(Math.floor(1000 + Math.random() * 9000));
    }
    makeVerificationKey(method, contact) {
        return `${method}:${contact}`;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map