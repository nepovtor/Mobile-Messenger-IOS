import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { getJwtSecret } from "../common/runtime-config";
import { AdminController } from "./admin.controller";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: async () => ({
        secret: getJwtSecret(),
      }),
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
  exports: [AdminGuard, JwtModule],
})
export class AdminModule {}
