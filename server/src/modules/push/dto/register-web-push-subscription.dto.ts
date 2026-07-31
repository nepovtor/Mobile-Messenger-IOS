import { Type } from "class-transformer";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from "class-validator";

class WebPushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  auth!: string;
}

export class RegisterWebPushSubscriptionDto {
  @IsUrl({
    protocols: ["https"],
    require_protocol: true,
  })
  @MaxLength(2048)
  endpoint!: string;

  @IsOptional()
  expirationTime?: number | null;

  @ValidateNested()
  @Type(() => WebPushSubscriptionKeysDto)
  keys!: WebPushSubscriptionKeysDto;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;
}
