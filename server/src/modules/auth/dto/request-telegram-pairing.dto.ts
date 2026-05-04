import { IsString } from "class-validator";

export class RequestTelegramPairingDto {
  @IsString()
  phone!: string;
}
