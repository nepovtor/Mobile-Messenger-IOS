import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";
import { PushEnvironment } from "../../../entities/push-subscription.entity";

export class RegisterIosPushDeviceDto {
  @IsString()
  @Matches(/^[0-9a-fA-F]+$/, {
    message: "token must be a hex-encoded APNs device token",
  })
  token!: string;

  @IsOptional()
  @IsEnum(PushEnvironment)
  environment?: PushEnvironment;

  @IsString()
  @IsNotEmpty()
  bundleId!: string;
}
