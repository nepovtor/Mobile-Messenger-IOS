import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class OneTimePreKeyDto {
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  keyId!: number;

  @IsString()
  @MinLength(44)
  @MaxLength(5_464)
  publicKey!: string;
}

export class UploadPreKeysDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => OneTimePreKeyDto)
  preKeys!: OneTimePreKeyDto[];
}
