import {
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { DevicePlatform } from "../../../entities/user-device.entity";

const MAX_PUBLIC_KEY_BASE64_LENGTH = 5_464;

export class RegisterDeviceDto {
  @IsString()
  @Matches(/^[\p{L}\p{N} ._()/-]{1,128}$/u)
  deviceName!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @IsString()
  @MinLength(44)
  @MaxLength(MAX_PUBLIC_KEY_BASE64_LENGTH)
  identityPublicKey!: string;

  @IsString()
  @MinLength(44)
  @MaxLength(MAX_PUBLIC_KEY_BASE64_LENGTH)
  signedPreKey!: string;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  signedPreKeyId!: number;

  @IsString()
  @MinLength(44)
  @MaxLength(MAX_PUBLIC_KEY_BASE64_LENGTH)
  signedPreKeySignature!: string;

  @IsInt()
  @Min(1)
  @Max(16_380)
  registrationId!: number;
}
