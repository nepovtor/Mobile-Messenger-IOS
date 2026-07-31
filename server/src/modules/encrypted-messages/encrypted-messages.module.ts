import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChatParticipantEntity } from "../../entities/chat-participant.entity";
import { ChatEntity } from "../../entities/chat.entity";
import { ContactRequestEntity } from "../../entities/contact-request.entity";
import { EncryptedMessageEnvelopeEntity } from "../../entities/encrypted-message-envelope.entity";
import { EncryptedMessageEntity } from "../../entities/encrypted-message.entity";
import { UserDeviceEntity } from "../../entities/user-device.entity";
import { AuthModule } from "../auth/auth.module";
import { DevicesModule } from "../devices/devices.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { SecurityModule } from "../security/security.module";
import { EncryptedMessagesController } from "./encrypted-messages.controller";
import { EncryptedMessagesService } from "./encrypted-messages.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatEntity,
      ChatParticipantEntity,
      ContactRequestEntity,
      UserDeviceEntity,
      EncryptedMessageEntity,
      EncryptedMessageEnvelopeEntity,
    ]),
    AuthModule,
    DevicesModule,
    RealtimeModule,
    SecurityModule,
  ],
  controllers: [EncryptedMessagesController],
  providers: [EncryptedMessagesService],
  exports: [EncryptedMessagesService],
})
export class EncryptedMessagesModule {}
