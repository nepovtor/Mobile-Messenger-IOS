import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { compare } from "bcryptjs";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AdminEntity } from "../../entities/admin.entity";
import { AuthenticatedAdmin } from "../common/authenticated-admin";
import {
  getAdminDisplayName,
  getAdminJwtExpiresIn,
  getAdminLogin,
  getAdminPassword,
  getJwtSecret,
  isAdminConsoleEnabled,
} from "../common/runtime-config";
import { AdminLoginDto } from "./dto/admin-login.dto";

@Injectable()
export class AdminService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(AdminEntity)
    private readonly adminsRepository: Repository<AdminEntity>,
  ) {}

  async login(dto: AdminLoginDto) {
    const normalizedLogin = dto.login.trim().toLowerCase();
    const databaseAdmin = await this.adminsRepository
      .createQueryBuilder("admin")
      .addSelect("admin.passwordHash")
      .where("admin.login = :login", { login: normalizedLogin })
      .getOne();

    if (databaseAdmin?.passwordHash) {
      const passwordMatches = await compare(
        dto.password,
        databaseAdmin.passwordHash,
      );
      if (!passwordMatches) {
        throw new UnauthorizedException("Invalid admin credentials");
      }

      const admin = this.buildAdminPayload(
        databaseAdmin.login,
        databaseAdmin.displayName,
      );
      return this.buildLoginResponse(admin);
    }

    if (!isAdminConsoleEnabled()) {
      throw new ForbiddenException("Admin console is disabled");
    }

    const fallbackLogin = getAdminLogin().trim().toLowerCase();
    const fallbackPassword = getAdminPassword();
    if (!fallbackPassword) {
      throw new ForbiddenException("Admin console is disabled");
    }

    if (
      normalizedLogin !== fallbackLogin ||
      dto.password !== fallbackPassword
    ) {
      throw new UnauthorizedException("Invalid admin credentials");
    }

    const admin = this.buildAdminPayload(
      getAdminLogin(),
      getAdminDisplayName(),
    );
    return this.buildLoginResponse(admin);
  }

  getMe(admin: AuthenticatedAdmin) {
    return this.toProfile(admin);
  }

  private async buildLoginResponse(admin: AuthenticatedAdmin) {
    const expiresIn = getAdminJwtExpiresIn();
    const token = await this.jwtService.signAsync(admin, {
      secret: getJwtSecret(),
      expiresIn: expiresIn as never,
    });

    return {
      token,
      admin: this.toProfile(admin),
      expiresIn,
    };
  }

  private buildAdminPayload(
    login: string,
    displayName: string,
  ): AuthenticatedAdmin {
    return {
      sub: `admin:${login}`,
      login,
      role: "admin",
      displayName,
    };
  }

  private toProfile(admin: AuthenticatedAdmin) {
    return {
      login: admin.login,
      role: admin.role,
      displayName: admin.displayName,
    };
  }
}
