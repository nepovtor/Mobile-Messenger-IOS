import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { buildNestDatabaseOptions } from "../database/database.config";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { AuthGuard } from "./auth/auth.guard";
import { ChatModule } from "./chat/chat.module";
import { ContactsModule } from "./contacts/contacts.module";
import { DocsModule } from "./docs/docs.module";
import { HealthModule } from "./health/health.module";
import { MediaModule } from "./media/media.module";
import { LocationModule } from "./location/location.module";
import { PushModule } from "./push/push.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { SystemModule } from "./system/system.module";
import { UsersModule } from "./users/users.module";
import { VersionModule } from "./version/version.module";

@Module({
  imports: [
    TypeOrmModule.forRoot(buildNestDatabaseOptions()),
    DocsModule,
    HealthModule,
    VersionModule,
    AdminModule,
    AuthModule,
    UsersModule,
    ContactsModule,
    LocationModule,
    RealtimeModule,
    PushModule,
    MediaModule,
    ChatModule,
    SystemModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
