import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;

  @IsUUID()
  messageID!: string;
}
