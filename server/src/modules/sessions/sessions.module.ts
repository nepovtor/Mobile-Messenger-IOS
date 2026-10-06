import { MatrixLifecycleModule } from "../matrix/matrix-lifecycle.module";
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthSessionEntity } from "../../entities/auth-session.entity";
import { RefreshTokenEntity } from "../../entities/refresh-token.entity";
import { SecurityModule } from "../security/security.module";
import { SessionService } from "./session.service";

@Module({
  imports: [
    JwtModule.register({}),
    TypeOrmModule.forFeature([AuthSessionEntity, RefreshTokenEntity]),
    SecurityModule,
    MatrixLifecycleModule,
  ],
  providers: [SessionService],
  exports: [JwtModule, SessionService, TypeOrmModule],
})
export class SessionsModule {}
