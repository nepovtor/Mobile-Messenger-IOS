import { IsString, IsUUID, MaxLength } from "class-validator";

export class SendRealtimeMessageDto {
  @IsUUID()
  messageID!: string;

  @IsString()
  @MaxLength(4000)
  text!: string;
}
