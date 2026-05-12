import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AdminEntity } from "../../entities/admin.entity";
import { AuthenticatedAdmin } from "../common/authenticated-admin";
import {
  getAdminLogin,
  getJwtSecret,
  isAdminConsoleEnabled,
} from "../common/runtime-config";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(AdminEntity)
    private readonly adminsRepository: Repository<AdminEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      admin?: AuthenticatedAdmin;
    }>();

    if (request.admin) {
      return true;
    }

    const header = request.headers["authorization"];
    const token = Array.isArray(header) ? header[0] : header;

    if (!token?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      const admin = this.jwtService.verify<AuthenticatedAdmin>(token.slice(7), {
        secret: getJwtSecret(),
      });
      if (admin.role !== "admin") {
        throw new UnauthorizedException("Admin access required");
      }

      const databaseAdmin = await this.adminsRepository.findOneBy({
        login: admin.login,
      });
      const fallbackAllowed =
        isAdminConsoleEnabled() &&
        admin.login.trim().toLowerCase() ===
          getAdminLogin().trim().toLowerCase();
      if (!databaseAdmin && !fallbackAllowed) {
        throw new ForbiddenException(
          "Admin associated with token was not found",
        );
      }

      request.admin = admin;
      return true;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new UnauthorizedException("Invalid bearer token");
    }
  }
}
