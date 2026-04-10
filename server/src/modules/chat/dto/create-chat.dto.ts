import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateChatDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  participantIDs?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  participantContacts?: string[];
}
