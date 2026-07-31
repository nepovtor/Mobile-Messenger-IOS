import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminEntity } from "../../entities/admin.entity";
import { SecurityModule } from "../security/security.module";
import { SessionsModule } from "../sessions/sessions.module";
import { AdminController } from "./admin.controller";
import { AdminGuard } from "./admin.guard";
import { AdminRateLimitService } from "./admin-rate-limit.service";
import { AdminService } from "./admin.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminEntity]),
    SecurityModule,
    SessionsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard, AdminRateLimitService],
  exports: [AdminGuard, SessionsModule, TypeOrmModule],
})
export class AdminModule {}
