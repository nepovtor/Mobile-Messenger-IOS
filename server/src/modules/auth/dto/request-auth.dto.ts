import { IsEnum, IsOptional, IsString } from "class-validator";
import { AuthMethod } from "../../../entities/user.entity";

export class RequestAuthDto {
  @IsOptional()
  @IsEnum(AuthMethod)
  method?: AuthMethod;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
