import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChatParticipantEntity } from "../../entities/chat-participant.entity";
import { ChatEntity } from "../../entities/chat.entity";
import { ContactRequestEntity } from "../../entities/contact-request.entity";
import { OneTimePreKeyEntity } from "../../entities/one-time-prekey.entity";
import { UserDeviceEntity } from "../../entities/user-device.entity";
import { AuthModule } from "../auth/auth.module";
import { SecurityModule } from "../security/security.module";
import { SessionsModule } from "../sessions/sessions.module";
import { DevicesController } from "./devices.controller";
import { DevicesService } from "./devices.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserDeviceEntity,
      OneTimePreKeyEntity,
      ContactRequestEntity,
      ChatParticipantEntity,
      ChatEntity,
    ]),
    AuthModule,
    SecurityModule,
    SessionsModule,
  ],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService, TypeOrmModule],
})
export class DevicesModule {}
