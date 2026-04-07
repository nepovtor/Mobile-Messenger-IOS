import { IsUUID } from "class-validator";
import { SendMessageDto } from "./send-message.dto";

export class SendRealtimeMessageDto extends SendMessageDto {
  @IsUUID()
  chatId!: string;
}
