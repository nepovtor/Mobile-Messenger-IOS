import { Logger, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PhoneVerificationCodeEntity } from "../../entities/phone-verification-code.entity";
import { UserEntity } from "../../entities/user.entity";
import {
  getJwtSecret,
  getSmsProvider,
  getTwilioConfig,
} from "../common/runtime-config";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthService } from "./auth.service";
import { ConsoleSmsProvider } from "./sms/console-sms.provider";
import { MockSmsProvider } from "./sms/mock-sms.provider";
import { SMS_SERVICE } from "./sms/sms.types";
import { TwilioSmsProvider } from "./sms/twilio-sms.provider";
import { UnavailableSmsProvider } from "./sms/unavailable-sms.provider";

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, PhoneVerificationCodeEntity]),
    JwtModule.registerAsync({
      useFactory: async () => ({
        secret: getJwtSecret(),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    AuthRateLimitService,
    {
      provide: SMS_SERVICE,
      useFactory: () => {
        const logger = new Logger("SmsProvider");
        const provider = getSmsProvider();

        if (provider === "mock") {
          return new MockSmsProvider();
        }

        if (provider === "console") {
          return new ConsoleSmsProvider(logger);
        }

        if (provider === "twilio") {
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
          `SMS provider "${provider}" is not implemented in this build`,
        );
      },
    },
  ],
  exports: [
    AuthService,
    AuthGuard,
    AuthRateLimitService,
    JwtModule,
    TypeOrmModule,
    SMS_SERVICE,
  ],
})
export class AuthModule {}
