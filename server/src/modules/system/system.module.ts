import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChatEntity } from "../../entities/chat.entity";
import { ContactEntity } from "../../entities/contact.entity";
import { LocationShareEntity } from "../../entities/location-share.entity";
import { MessageEntity } from "../../entities/message.entity";
import { UserEntity } from "../../entities/user.entity";
import { AdminModule } from "../admin/admin.module";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";

@Module({
  imports: [
    AdminModule,
    TypeOrmModule.forFeature([
      UserEntity,
      ContactEntity,
      ChatEntity,
      MessageEntity,
      LocationShareEntity,
    ]),
  ],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
