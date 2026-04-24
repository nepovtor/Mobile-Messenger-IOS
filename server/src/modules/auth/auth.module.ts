import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "../../entities/user.entity";
import { getJwtSecret } from "../common/runtime-config";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthService } from "./auth.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.registerAsync({
      useFactory: async () => ({
        secret: getJwtSecret(),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, AuthRateLimitService],
  exports: [
    AuthService,
    AuthGuard,
    AuthRateLimitService,
    JwtModule,
    TypeOrmModule,
  ],
})
export class AuthModule {}
