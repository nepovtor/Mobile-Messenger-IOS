import { IsNotEmpty, IsString } from "class-validator";

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;
}
