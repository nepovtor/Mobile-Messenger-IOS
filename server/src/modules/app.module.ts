import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ContactEntity } from "../entities/contact.entity";
import { LocationShareEntity } from "../entities/location-share.entity";
import { PhoneVerificationCodeEntity } from "../entities/phone-verification-code.entity";
import { TelegramLinkEntity } from "../entities/telegram-link.entity";
import { TelegramPairingTokenEntity } from "../entities/telegram-pairing-token.entity";
import { AdminModule } from "./admin/admin.module";
import { isDatabaseSynchronizationEnabled } from "./common/runtime-config";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { ContactsModule } from "./contacts/contacts.module";
import { DocsModule } from "./docs/docs.module";
import { HealthModule } from "./health/health.module";
import { MediaModule } from "./media/media.module";
import { LocationModule } from "./location/location.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { SystemModule } from "./system/system.module";
import { UsersModule } from "./users/users.module";
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
      entities: [
        ContactEntity,
        LocationShareEntity,
        PhoneVerificationCodeEntity,
        TelegramLinkEntity,
        TelegramPairingTokenEntity,
      ],
    }),
    DocsModule,
    HealthModule,
    VersionModule,
    AdminModule,
    AuthModule,
    UsersModule,
    ContactsModule,
    LocationModule,
    RealtimeModule,
    MediaModule,
    ChatModule,
    SystemModule,
  ],
})
export class AppModule {}
