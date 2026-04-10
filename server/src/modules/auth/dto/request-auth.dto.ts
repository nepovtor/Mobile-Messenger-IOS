import { IsEnum, IsString } from "class-validator";
import { AuthMethod } from "../../../entities/user.entity";

export class RequestAuthDto {
  @IsEnum(AuthMethod)
  method!: AuthMethod;

  @IsString()
  contact!: string;
}
