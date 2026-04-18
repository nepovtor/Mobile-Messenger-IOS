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
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../../entities/user.entity");
const DEMO_ACCOUNTS = [
    {
        contact: "+15551230011",
        displayName: "Анна Demo",
        password: "demo1111",
    },
    {
        contact: "+15551230012",
        displayName: "Борис Demo",
        password: "demo2222",
    },
    {
        contact: "+15551230013",
        displayName: "Вера Demo",
        password: "demo3333",
    },
    {
        contact: "+15551230014",
        displayName: "Глеб Demo",
        password: "demo4444",
    },
    {
        contact: "+15551230015",
        displayName: "Даша Demo",
        password: "demo5555",
    },
];
let AuthService = AuthService_1 = class AuthService {
    constructor(userRepository, jwtService) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    async requestCode({ method, contact }) {
        if (method !== "phone") {
            throw new common_1.BadRequestException("Only phone method supported");
        }
        const code = "123456";
        this.logger.log(`Verification code generated for ${contact}`);
        this.logger.debug(`Verification code for ${contact}: ${code}`);
        return { expiresIn: 300 };
    }
    async verifyCode({ method, contact, code, displayName }) {
        if (method !== "phone") {
            throw new common_1.BadRequestException("Only phone method supported");
        }
        const acceptedCode = "123456";
        if (code !== acceptedCode) {
            throw new common_1.UnauthorizedException("Invalid or expired code");
        }
        let user = await this.userRepository.findOne({
            where: { phone: contact },
        });
        if (!user) {
            const fallbackName = `User ${contact.slice(-4)}`;
            const requestedDisplayName = this.normalizeDisplayName(displayName);
            user = this.userRepository.create({
                phone: contact,
                displayName: requestedDisplayName ?? fallbackName,
            });
            await this.userRepository.save(user);
        }
        else if (displayName) {
            const requestedDisplayName = this.normalizeDisplayName(displayName);
            if (requestedDisplayName && requestedDisplayName !== user.displayName) {
                user.displayName = requestedDisplayName;
                await this.userRepository.save(user);
            }
        }
        return this.createSessionResponse(user);
    }
    async login({ method, contact, password }) {
        if (method !== "phone") {
            throw new common_1.BadRequestException("Only phone method supported");
        }
        const demoAccount = DEMO_ACCOUNTS.find((account) => account.contact === contact &&
            account.password === password.trim());
        if (!demoAccount) {
            throw new common_1.UnauthorizedException("Invalid demo credentials");
        }
        const user = await this.findOrCreateUser(demoAccount.contact, demoAccount.displayName);
        return this.createSessionResponse(user);
    }
    async getCurrentUser(userID) {
        const user = await this.requireUser(userID);
        return {
            userID: String(user.id),
            displayName: user.displayName,
            phone: user.phone,
        };
    }
    async listContacts(userID) {
        await this.ensureDemoAccounts();
        const currentUser = await this.requireUser(userID);
        const users = await this.userRepository.find({
            order: { displayName: "ASC" },
        });
        const demoOrder = new Map(DEMO_ACCOUNTS.map((account, index) => [account.contact, index]));
        return users
            .sort((left, right) => {
            if (left.id === currentUser.id) {
                return -1;
            }
            if (right.id === currentUser.id) {
                return 1;
            }
            const leftOrder = demoOrder.get(left.phone);
            const rightOrder = demoOrder.get(right.phone);
            if (leftOrder !== undefined && rightOrder !== undefined) {
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
            userID: String(user.id),
            displayName: user.displayName,
            contact: user.phone,
            isCurrentUser: user.id === currentUser.id,
        }));
    }
    async updateProfile(userID, { displayName }) {
        const user = await this.requireUser(userID);
        const requestedDisplayName = this.normalizeDisplayName(displayName);
        if (!requestedDisplayName) {
            throw new common_1.BadRequestException("Display name is required");
        }
        if (requestedDisplayName !== user.displayName) {
            user.displayName = requestedDisplayName;
            await this.userRepository.save(user);
        }
        return {
            userID: String(user.id),
            displayName: user.displayName,
            phone: user.phone,
        };
    }
    normalizeDisplayName(value) {
        if (typeof value !== "string") {
            return null;
        }
        const normalized = value.trim().replace(/\s+/g, " ");
        if (!normalized) {
            return null;
        }
        return normalized.slice(0, 50);
    }
    async requireUser(userID) {
        const user = await this.userRepository.findOne({
            where: { id: userID },
        });
        if (!user) {
            throw new common_1.NotFoundException("User not found");
        }
        return user;
    }
    createSessionResponse(user) {
        const userID = String(user.id);
        const token = this.jwtService.sign({
            sub: userID,
            userID,
            phone: user.phone,
        });
        return {
            token,
            userID,
            displayName: user.displayName,
            phone: user.phone,
        };
    }
    async ensureDemoAccounts() {
        for (const account of DEMO_ACCOUNTS) {
            await this.findOrCreateUser(account.contact, account.displayName);
        }
    }
    async findOrCreateUser(contact, displayName) {
        let user = await this.userRepository.findOne({
            where: { phone: contact },
        });
        if (!user) {
            user = this.userRepository.create({
                phone: contact,
                displayName,
            });
            await this.userRepository.save(user);
            return user;
        }
        if (user.displayName !== displayName) {
            user.displayName = displayName;
            await this.userRepository.save(user);
        }
        return user;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map