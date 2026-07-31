import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EncryptedAttachmentEntity } from "../../entities/encrypted-attachment.entity";
import { MediaEntity } from "../../entities/media.entity";
import { AuthModule } from "../auth/auth.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaEntity, EncryptedAttachmentEntity]),
    AuthModule,
  ],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService, TypeOrmModule],
})
export class MediaModule {}
