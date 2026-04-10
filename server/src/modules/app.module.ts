import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
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
      synchronize: true,
      retryAttempts: 5,
      retryDelay: 2000,
    }),
    HealthModule,
    VersionModule,
    AuthModule,
    RealtimeModule,
    MediaModule,
    ChatModule,
  ],
})
export class AppModule {}
