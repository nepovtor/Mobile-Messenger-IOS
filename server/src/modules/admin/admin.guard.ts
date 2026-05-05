import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthenticatedAdmin } from "../common/authenticated-admin";
import { getJwtSecret } from "../common/runtime-config";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      admin?: AuthenticatedAdmin;
    }>();
    const header = request.headers.authorization;
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
      request.admin = admin;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid bearer token");
    }
  }
}
