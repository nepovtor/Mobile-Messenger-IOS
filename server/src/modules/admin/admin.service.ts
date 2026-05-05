import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
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
  constructor(private readonly jwtService: JwtService) {}

  async login(dto: AdminLoginDto) {
    if (!isAdminConsoleEnabled()) {
      throw new ForbiddenException("Admin console is disabled");
    }

    const login = getAdminLogin();
    const password = getAdminPassword();
    if (!password) {
      throw new ForbiddenException("Admin console is disabled");
    }

    if (dto.login.trim() !== login || dto.password !== password) {
      throw new UnauthorizedException("Invalid admin credentials");
    }

    const admin = this.buildAdminPayload();
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

  getMe(admin: AuthenticatedAdmin) {
    return this.toProfile(admin);
  }

  private buildAdminPayload(): AuthenticatedAdmin {
    return {
      sub: `admin:${getAdminLogin()}`,
      login: getAdminLogin(),
      role: "admin",
      displayName: getAdminDisplayName(),
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
