import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AdminEntity } from "../../entities/admin.entity";
import { SessionPrincipalType } from "../../entities/auth-session.entity";
import { AuthenticatedAdmin } from "../common/authenticated-admin";
import { ADMIN_ACCESS_COOKIE } from "../sessions/session-cookies";
import { getAccessTokenFromRequest } from "../sessions/session-request";
import { SessionService } from "../sessions/session.service";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly sessionService: SessionService,
    @InjectRepository(AdminEntity)
    private readonly adminsRepository: Repository<AdminEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Parameters<typeof getAccessTokenFromRequest>[0] & {
        admin?: AuthenticatedAdmin;
      }
    >();
    if (request.admin) {
      return true;
    }

    const token = getAccessTokenFromRequest(request, ADMIN_ACCESS_COOKIE);
    if (!token) {
      throw new UnauthorizedException("Missing admin access token");
    }
    try {
      const claims = await this.sessionService.verifyAccessToken(
        token,
        SessionPrincipalType.ADMIN,
      );
      const session = await this.sessionService.requireActiveSession(claims);
      const admin = await this.adminsRepository.findOneBy({
        id: claims.sub as AdminEntity["id"],
      });
      if (
        !admin ||
        !admin.isActive ||
        admin.deactivatedAt ||
        Number(admin.sessionVersion) !== claims.sv
      ) {
        throw new UnauthorizedException("Admin session is no longer valid");
      }
      request.admin = {
        sub: admin.id,
        sid: claims.sid,
        jti: claims.jti,
        login: admin.login,
        role: "admin",
        displayName: admin.displayName,
        sessionVersion: Number(admin.sessionVersion),
        deviceUuid: session.deviceUuid,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid admin access token");
    }
  }
}
