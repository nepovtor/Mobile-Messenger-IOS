import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from "class-validator";

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsIn(["text", "image"])
  kind?: "text" | "image";

  @ValidateIf((value) => value.kind === "image")
  @IsUUID()
  mediaID?: string;

  @IsUUID()
  messageID!: string;
}
