import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Matches,
} from "class-validator";

export class CreateChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  @IsOptional()
  participantIds?: string[];

  @IsArray()
  @ArrayUnique()
  @Matches(/^\+?[1-9]\d{9,14}$/, { each: true })
  @IsOptional()
  participantContacts?: string[];
}
