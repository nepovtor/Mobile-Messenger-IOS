import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PushSubscriptionEntity } from "../../entities/push-subscription.entity";
import { TelegramLinkEntity } from "../../entities/telegram-link.entity";
import { UserEntity } from "../../entities/user.entity";
import { AuthModule } from "../auth/auth.module";
import { ApnsPushProvider } from "./apns-push.provider";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";
import { WebPushProvider } from "./web-push.provider";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PushSubscriptionEntity,
      UserEntity,
      TelegramLinkEntity,
    ]),
    AuthModule,
  ],
  controllers: [PushController],
  providers: [PushService, WebPushProvider, ApnsPushProvider],
  exports: [PushService, WebPushProvider, ApnsPushProvider],
})
export class PushModule {}
