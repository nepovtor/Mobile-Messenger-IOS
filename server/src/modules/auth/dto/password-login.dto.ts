import { Length } from "class-validator";
import { RequestCodeDto } from "./request-code.dto";

export class PasswordLoginDto extends RequestCodeDto {
  @Length(4, 64)
  password!: string;
}
