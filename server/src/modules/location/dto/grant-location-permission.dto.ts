import { IsDateString } from "class-validator";

export class GrantLocationPermissionDto {
  @IsDateString({ strict: true })
  expiresAt!: string;
}
