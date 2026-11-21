import { IsIP, IsString, IsUUID, Length } from "class-validator";

export class OidcBridgeRequestDto {
  @IsString()
  @Length(8, 32)
  phone!: string;

  @IsUUID("4")
  deviceUuid!: string;

  @IsIP()
  ipAddress!: string;
}

export class OidcBridgeVerifyDto extends OidcBridgeRequestDto {
  @IsString()
  @Length(4, 12)
  code!: string;
}

export class OidcBridgeAccountDto {
  @IsUUID()
  subject!: string;
}
