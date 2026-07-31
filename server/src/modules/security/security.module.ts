import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthSessionEntity } from "../../entities/auth-session.entity";
import { RefreshTokenEntity } from "../../entities/refresh-token.entity";
import { SecurityAuditEventEntity } from "../../entities/security-audit-event.entity";
import { SecurityAuditService } from "./security-audit.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuthSessionEntity,
      RefreshTokenEntity,
      SecurityAuditEventEntity,
    ]),
  ],
  providers: [SecurityAuditService],
  exports: [SecurityAuditService, TypeOrmModule],
})
export class SecurityModule {}
