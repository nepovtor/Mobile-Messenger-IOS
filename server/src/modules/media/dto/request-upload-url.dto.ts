import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class RequestUploadUrlDto {
  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(20_000_000)
  sizeBytes!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20_000)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20_000)
  height?: number;
}
