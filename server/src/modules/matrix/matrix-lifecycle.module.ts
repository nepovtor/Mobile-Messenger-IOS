import { Module } from "@nestjs/common";
import { MatrixRevocationWorker } from "./matrix-revocation.worker";
@Module({
  providers: [MatrixRevocationWorker],
  exports: [MatrixRevocationWorker],
})
export class MatrixLifecycleModule {}
