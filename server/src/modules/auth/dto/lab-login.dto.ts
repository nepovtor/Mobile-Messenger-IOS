import { IsString, Length } from "class-validator";

export class LabLoginDto {
  @IsString()
  @Length(3, 64)
  login!: string;

  @IsString()
  @Length(4, 128)
  password!: string;
}
