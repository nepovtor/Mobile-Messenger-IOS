import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { EncryptedMessageType } from "../../../entities/encrypted-message.entity";

const MAX_CIPHERTEXT_BASE64_LENGTH = 1_398_104;
const MAX_HEADER_BASE64_LENGTH = 87_384;

export class EncryptedEnvelopeDto {
  @IsUUID()
  recipientDeviceID!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9._-]+$/)
  envelopeType!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(MAX_CIPHERTEXT_BASE64_LENGTH)
  ciphertext!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(MAX_HEADER_BASE64_LENGTH)
  encryptedHeader!: string;
}

export class SubmitEncryptedMessageDto {
  @IsUUID()
  chatID!: string;

  @IsUUID()
  senderDeviceID!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9._-]+$/)
  protocolVersion!: string;

  @IsEnum(EncryptedMessageType)
  messageType!: EncryptedMessageType;

  @IsOptional()
  @IsUUID()
  targetMessageID?: string;

  @IsDateString({ strict: true })
  clientTimestamp!: string;

  @IsUUID()
  idempotencyKey!: string;

  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  membershipEpoch!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(256)
  @ValidateNested({ each: true })
  @Type(() => EncryptedEnvelopeDto)
  envelopes!: EncryptedEnvelopeDto[];
}
