import { IsUrl, MaxLength } from "class-validator";

export class DeleteWebPushSubscriptionDto {
  @IsUrl({
    protocols: ["https"],
    require_protocol: true,
  })
  @MaxLength(2048)
  endpoint!: string;
}
