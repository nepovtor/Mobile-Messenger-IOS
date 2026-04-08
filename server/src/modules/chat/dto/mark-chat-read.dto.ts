import { IsOptional, IsUUID } from "class-validator";

export class MarkChatReadDto {
  @IsOptional()
  @IsUUID()
  messageID?: string;
}
