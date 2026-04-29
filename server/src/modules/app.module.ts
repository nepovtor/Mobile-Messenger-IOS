import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PhoneVerificationCodeEntity } from "../entities/phone-verification-code.entity";
import { TelegramLinkEntity } from "../entities/telegram-link.entity";
import { isDatabaseSynchronizationEnabled } from "./common/runtime-config";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { DocsModule } from "./docs/docs.module";
import { HealthModule } from "./health/health.module";
import { MediaModule } from "./media/media.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { VersionModule } from "./version/version.module";

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || "5432"),
      username: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      database: process.env.DB_NAME || "messenger",
      autoLoadEntities: true,
      synchronize: isDatabaseSynchronizationEnabled(),
      retryAttempts: 5,
      retryDelay: 2000,
      entities: [PhoneVerificationCodeEntity, TelegramLinkEntity],
    }),
    DocsModule,
    HealthModule,
    VersionModule,
    AuthModule,
    RealtimeModule,
    MediaModule,
    ChatModule,
  ],
})
export class AppModule {}
