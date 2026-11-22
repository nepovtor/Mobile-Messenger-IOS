import { MatrixLifecycleModule } from "../matrix/matrix-lifecycle.module";
import { Logger, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PhoneVerificationCodeEntity } from "../../entities/phone-verification-code.entity";
import { TelegramLinkEntity } from "../../entities/telegram-link.entity";
import { TelegramPairingTokenEntity } from "../../entities/telegram-pairing-token.entity";
import { UserEntity } from "../../entities/user.entity";
import {
  getVerificationProvider,
  getSmsProvider,
  getTwilioConfig,
} from "../common/runtime-config";
import { SecurityModule } from "../security/security.module";
import { SessionsModule } from "../sessions/sessions.module";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthService } from "./auth.service";
import { LoginController } from "./login.controller";
import { OidcBridgeController } from "./oidc-bridge.controller";
import { OidcBridgeGuard } from "./oidc-bridge.guard";
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
    SecurityModule,
    SessionsModule,
    MatrixLifecycleModule,
  ],
  controllers: [AuthController, LoginController, OidcBridgeController],
  providers: [
    AuthService,
    AuthGuard,
    OidcBridgeGuard,
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
    SessionsModule,
    MatrixLifecycleModule,
    TypeOrmModule,
    SMS_SERVICE,
  ],
})
export class AuthModule {}
