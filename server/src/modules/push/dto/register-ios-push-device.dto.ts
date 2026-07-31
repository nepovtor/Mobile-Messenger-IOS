import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from "class-validator";
import { PushEnvironment } from "../../../entities/push-subscription.entity";

export class RegisterIosPushDeviceDto {
  @IsString()
  @MaxLength(200)
  @Matches(/^[0-9a-fA-F]+$/, {
    message: "token must be a hex-encoded APNs device token",
  })
  token!: string;

  @IsOptional()
  @IsEnum(PushEnvironment)
  environment?: PushEnvironment;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  bundleId!: string;
}
