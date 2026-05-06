import { IsUrl } from "class-validator";

export class DeleteWebPushSubscriptionDto {
  @IsUrl({
    protocols: ["https"],
    require_protocol: true,
  })
  endpoint!: string;
}
