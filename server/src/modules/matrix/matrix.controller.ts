import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsInt, IsString, MaxLength, Min } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/authenticated-user";
import { MatrixService } from "./matrix.service";

export class BindMatrixRoomDto {
  @IsString() @MaxLength(255) roomID!: string;
  @IsInt() @Min(1) epoch!: number;
}

@Controller("matrix")
@UseGuards(AuthGuard)
export class MatrixController {
  constructor(private readonly matrix: MatrixService) {}
  @Header("Cache-Control", "no-store") @Get("config") config(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.matrix.publicConfig(user.sub);
  }
  @Header("Cache-Control", "no-store") @Get("chats/:chatID") descriptor(
    @CurrentUser() user: AuthenticatedUser,
    @Param("chatID", ParseUUIDPipe) chatID: string,
  ) {
    return this.matrix.descriptor(user.sub, chatID);
  }
  @Header("Cache-Control", "no-store") @Post("chats/:chatID") bind(
    @CurrentUser() user: AuthenticatedUser,
    @Param("chatID", ParseUUIDPipe) chatID: string,
    @Body() dto: BindMatrixRoomDto,
  ) {
    return this.matrix.bind(user.sub, chatID, dto);
  }
  @Header("Cache-Control", "no-store") @Get("revocation") revocation(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.matrix.revocationStatus(user.sub);
  }
}
