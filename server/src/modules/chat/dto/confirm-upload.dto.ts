import { IsOptional, IsString, MaxLength } from "class-validator";

export class ConfirmUploadDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  etag?: string;
}
