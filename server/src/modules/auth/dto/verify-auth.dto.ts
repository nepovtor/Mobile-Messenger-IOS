import { IsEnum, IsString, Length } from "class-validator";
import { AuthMethod } from "../../../entities/user.entity";

export class VerifyAuthDto {
  @IsEnum(AuthMethod)
  method!: AuthMethod;

  @IsString()
  contact!: string;

  @IsString()
  @Length(4, 12)
  code!: string;
}
