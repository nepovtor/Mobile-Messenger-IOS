import { IsString, MinLength } from "class-validator";

export class AdminLoginDto {
  @IsString()
  @MinLength(1)
  login!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
