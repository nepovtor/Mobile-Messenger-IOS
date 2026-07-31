import { IsOptional, IsString, Length } from "class-validator";

export class RefreshSessionDto {
  @IsOptional()
  @IsString()
  @Length(40, 256)
  refreshToken?: string;
}
