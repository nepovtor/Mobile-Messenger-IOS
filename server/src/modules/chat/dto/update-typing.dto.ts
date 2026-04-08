import { IsBoolean } from "class-validator";

export class UpdateTypingDto {
  @IsBoolean()
  isTyping!: boolean;
}
