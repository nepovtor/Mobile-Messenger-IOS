import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { MessageKind } from "../../../entities/message.entity";

export class SendRealtimeMessageDto {
  @IsUUID()
  chatId!: string;

  @IsUUID()
  messageID!: string;

  @IsEnum(MessageKind)
  kind!: MessageKind;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsUUID()
  mediaID?: string;
}
