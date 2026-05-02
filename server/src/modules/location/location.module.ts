import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ContactEntity } from "../../entities/contact.entity";
import { LocationShareEntity } from "../../entities/location-share.entity";
import { UserEntity } from "../../entities/user.entity";
import { AuthModule } from "../auth/auth.module";
import { LocationController } from "./location.controller";
import { LocationService } from "./location.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([LocationShareEntity, ContactEntity, UserEntity]),
    AuthModule,
  ],
  controllers: [LocationController],
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
