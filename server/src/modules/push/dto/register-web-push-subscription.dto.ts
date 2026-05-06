import { Type } from "class-transformer";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from "class-validator";

class WebPushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  auth!: string;
}

export class RegisterWebPushSubscriptionDto {
  @IsUrl({
    protocols: ["https"],
    require_protocol: true,
  })
  endpoint!: string;

  @IsOptional()
  expirationTime?: number | null;

  @ValidateNested()
  @Type(() => WebPushSubscriptionKeysDto)
  keys!: WebPushSubscriptionKeysDto;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
