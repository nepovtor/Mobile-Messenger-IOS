import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChatEntity } from "../../entities/chat.entity";
import { ContactRequestEntity } from "../../entities/contact-request.entity";
import { ContactEntity } from "../../entities/contact.entity";
import { LocationPermissionEntity } from "../../entities/location-permission.entity";
import { UserEntity } from "../../entities/user.entity";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContactEntity,
      ContactRequestEntity,
      LocationPermissionEntity,
      ChatEntity,
      UserEntity,
    ]),
    AuthModule,
    ChatModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
