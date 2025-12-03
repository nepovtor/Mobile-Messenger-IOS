import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { VersionModule } from './version/version.module';

@Module({
  imports: [HealthModule, VersionModule],
})
export class AppModule {}
