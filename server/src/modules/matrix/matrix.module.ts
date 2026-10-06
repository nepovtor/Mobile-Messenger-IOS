import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MatrixService } from "./matrix.service";
import { MatrixController } from "./matrix.controller";
import { MatrixLifecycleModule } from "./matrix-lifecycle.module";

@Module({
  imports: [AuthModule, MatrixLifecycleModule],
  controllers: [MatrixController],
  providers: [MatrixService],
})
export class MatrixModule {}
