import { Length } from "class-validator";
import { RequestCodeDto } from "./request-code.dto";

export class LoginAuthDto extends RequestCodeDto {
  @Length(4, 64)
  password!: string;
}
