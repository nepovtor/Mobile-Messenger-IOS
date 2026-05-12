import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Reflector } from "@nestjs/core";
import { Repository } from "typeorm";
import { UserEntity } from "../../entities/user.entity";
import { AuthenticatedUser } from "../common/authenticated-user";
import { getJwtSecret } from "../common/runtime-config";
import { IS_PUBLIC_ROUTE } from "./decorators/public.decorator";
import { SKIP_USER_AUTH } from "./decorators/skip-user-auth.decorator";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
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

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
    }>();

    if (request.user) {
      return true;
    }

    const header = request.headers["authorization"];
    const token = Array.isArray(header) ? header[0] : header;

    if (!token?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      const payload = this.jwtService.verify<AuthenticatedUser>(
        token.slice(7),
        {
          secret: getJwtSecret(),
        },
      );
      const user = await this.usersRepository.findOneBy({
        id: payload.sub as UserEntity["id"],
      });
      if (!user) {
        throw new ForbiddenException(
          "User associated with token was not found",
        );
      }

      request.user = {
        sub: user.id,
        login: user.login ?? user.contact,
        displayName: user.displayName,
        contact: user.contact,
        method: user.method,
        phone: user.phone ?? user.contact,
      };
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid bearer token");
    }
  }
}
