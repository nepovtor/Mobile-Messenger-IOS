import { Logger, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PhoneVerificationCodeEntity } from "../../entities/phone-verification-code.entity";
import { TelegramLinkEntity } from "../../entities/telegram-link.entity";
import { TelegramPairingTokenEntity } from "../../entities/telegram-pairing-token.entity";
import { UserEntity } from "../../entities/user.entity";
import {
  getJwtSecret,
  getVerificationProvider,
  getSmsProvider,
  getTwilioConfig,
} from "../common/runtime-config";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthService } from "./auth.service";
import { LoginController } from "./login.controller";
import { ConsoleSmsProvider } from "./sms/console-sms.provider";
import { MockSmsProvider } from "./sms/mock-sms.provider";
import { SMS_SERVICE } from "./sms/sms.types";
import { TwilioSmsProvider } from "./sms/twilio-sms.provider";
import { UnavailableSmsProvider } from "./sms/unavailable-sms.provider";
import { TelegramBotService } from "./telegram/telegram-bot.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      PhoneVerificationCodeEntity,
      TelegramLinkEntity,
      TelegramPairingTokenEntity,
    ]),
    JwtModule.registerAsync({
      useFactory: async () => ({
        secret: getJwtSecret(),
      }),
    }),
  ],
  controllers: [AuthController, LoginController],
  providers: [
    AuthService,
    AuthGuard,
    AuthRateLimitService,
    TelegramBotService,
    {
      provide: SMS_SERVICE,
      inject: [TelegramBotService],
      useFactory: (telegramBotService: TelegramBotService) => {
        const logger = new Logger("SmsProvider");
        const provider = getVerificationProvider();

        if (provider === "telegram") {
          return telegramBotService;
        }

        if (provider === "mock") {
          return new MockSmsProvider();
        }

        if (provider === "console") {
          return new ConsoleSmsProvider(logger);
        }

        if (provider === "sms") {
          const smsProvider = getSmsProvider();
          if (smsProvider === "mock") {
            return new MockSmsProvider();
          }
          if (smsProvider === "console") {
            return new ConsoleSmsProvider(logger);
          }

          const config = getTwilioConfig();
          if (!config) {
            return new UnavailableSmsProvider(
              logger,
              "Twilio credentials are not configured",
            );
          }

          return new TwilioSmsProvider(config, logger);
        }

        return new UnavailableSmsProvider(
          logger,
          `Verification provider "${provider}" is not implemented in this build`,
        );
      },
    },
  ],
  exports: [
    AuthService,
    AuthGuard,
    AuthRateLimitService,
    TelegramBotService,
    JwtModule,
    TypeOrmModule,
    SMS_SERVICE,
  ],
})
export class AuthModule {}
