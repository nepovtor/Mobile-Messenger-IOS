import { IsOptional, Length } from "class-validator";
import { RequestCodeDto } from "./request-code.dto";

export class VerifyCodeDto extends RequestCodeDto {
  @Length(4, 8)
  code!: string;

  @IsOptional()
  @Length(2, 40)
  displayName?: string;
}
