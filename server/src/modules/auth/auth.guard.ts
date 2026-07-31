import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Reflector } from "@nestjs/core";
import { Repository } from "typeorm";
import { SessionPrincipalType } from "../../entities/auth-session.entity";
import { UserEntity, UserStatus } from "../../entities/user.entity";
import { AuthenticatedUser } from "../common/authenticated-user";
import { SessionService } from "../sessions/session.service";
import { getAccessTokenFromRequest } from "../sessions/session-request";
import { USER_ACCESS_COOKIE } from "../sessions/session-cookies";
import { IS_PUBLIC_ROUTE } from "./decorators/public.decorator";
import { SKIP_USER_AUTH } from "./decorators/skip-user-auth.decorator";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    const shouldSkipUserAuth = this.reflector.getAllAndOverride<boolean>(
      SKIP_USER_AUTH,
      [context.getHandler(), context.getClass()],
    );

    if (isPublicRoute || shouldSkipUserAuth) {
      return true;
    }

    const request = context.switchToHttp().getRequest<
      Parameters<typeof getAccessTokenFromRequest>[0] & {
        user?: AuthenticatedUser;
      }
    >();

    if (request.user) {
      return true;
    }

    const token = getAccessTokenFromRequest(request, USER_ACCESS_COOKIE);
    if (!token) {
      throw new UnauthorizedException("Missing access token");
    }

    try {
      const claims = await this.sessionService.verifyAccessToken(
        token,
        SessionPrincipalType.USER,
      );
      const session = await this.sessionService.requireActiveSession(claims);
      const user = await this.usersRepository.findOneBy({
        id: claims.sub as UserEntity["id"],
      });
      if (
        !user ||
        user.status !== UserStatus.ACTIVE ||
        Number(user.sessionVersion) !== claims.sv
      ) {
        throw new UnauthorizedException("Session is no longer valid");
      }

      request.user = {
        sub: user.id,
        sid: claims.sid,
        jti: claims.jti,
        role: "user",
        sessionVersion: Number(user.sessionVersion),
        deviceUuid: session.deviceUuid,
        login: user.login ?? user.contact,
        displayName: user.displayName,
        contact: user.contact,
        method: user.method,
        phone: user.phone ?? user.contact,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid access token");
    }
  }
}
