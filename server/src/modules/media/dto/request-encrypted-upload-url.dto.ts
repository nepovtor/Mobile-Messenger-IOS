import { IsInt, IsString, Matches, Max, Min } from "class-validator";

export class RequestEncryptedUploadUrlDto {
  @IsInt()
  @Min(1)
  @Max(104_857_600)
  sizeBytes!: number;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  ciphertextSha256!: string;
}
