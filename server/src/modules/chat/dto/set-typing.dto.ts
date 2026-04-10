import { IsBoolean } from "class-validator";

export class SetTypingDto {
  @IsBoolean()
  isTyping!: boolean;
}
