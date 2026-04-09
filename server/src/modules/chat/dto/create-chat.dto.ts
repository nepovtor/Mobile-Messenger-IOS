import {
  ArrayUnique,
  IsBoolean,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  participantIds!: string[];

  @IsOptional()
  @IsBoolean()
  isDirect?: boolean;
}
