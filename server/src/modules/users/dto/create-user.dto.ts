import { IsOptional, IsString, Length } from "class-validator";

export class CreateUserDto {
  @IsString()
  @Length(3, 64)
  login!: string;

  @IsString()
  @Length(4, 128)
  password!: string;

  @IsString()
  @Length(2, 40)
  displayName!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
