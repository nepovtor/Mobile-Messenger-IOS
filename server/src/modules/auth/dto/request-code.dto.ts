import { IsEnum, Matches } from "class-validator";

export enum AuthMethodDto {
  Phone = "phone",
}

export class RequestCodeDto {
  @IsEnum(AuthMethodDto)
  method!: AuthMethodDto;

  @Matches(/^\+?[1-9]\d{9,14}$/, {
    message: "contact must be a valid phone number in E.164 format",
  })
  contact!: string;
}
