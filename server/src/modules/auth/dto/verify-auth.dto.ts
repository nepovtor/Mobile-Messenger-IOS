import { IsEnum, IsOptional, IsString, Length } from "class-validator";
import { AuthMethod } from "../../../entities/user.entity";

export class VerifyAuthDto {
  @IsOptional()
  @IsEnum(AuthMethod)
  method?: AuthMethod;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @Length(4, 12)
  code!: string;
}
