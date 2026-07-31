import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export class EncryptedInboxQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 100;

  @IsOptional()
  @IsDateString({ strict: true })
  after?: string;

  @IsOptional()
  @IsUUID()
  afterEnvelopeID?: string;
}
