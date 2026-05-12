import { SetMetadata } from "@nestjs/common";

export const SKIP_USER_AUTH = "skipUserAuth";

export const SkipUserAuth = () => SetMetadata(SKIP_USER_AUTH, true);
