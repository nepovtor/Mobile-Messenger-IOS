import { IsString, IsUUID, MaxLength } from "class-validator";

export class SendMessageDto {
  @IsUUID()
  messageID!: string;

  @IsString()
  @MaxLength(4000)
  text!: string;
}
