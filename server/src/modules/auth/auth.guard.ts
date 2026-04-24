import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthenticatedUser } from "../common/authenticated-user";
import { getJwtSecret } from "../common/runtime-config";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
    }>();
    const header = request.headers.authorization;
    const token = Array.isArray(header) ? header[0] : header;

    if (!token?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      request.user = this.jwtService.verify<AuthenticatedUser>(token.slice(7), {
        secret: getJwtSecret(),
      });
      return true;
    } catch {
      throw new UnauthorizedException("Invalid bearer token");
    }
  }
}
