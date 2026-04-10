import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/authenticated-user";
import { ConfirmUploadDto } from "./dto/confirm-upload.dto";
import { RequestUploadUrlDto } from "./dto/request-upload-url.dto";
import { MediaService } from "./media.service";

@Controller("media")
@UseGuards(AuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post("upload-url")
  createUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestUploadUrlDto,
  ) {
    return this.mediaService.createUploadUrl(user.sub, dto);
  }

  @Post(":mediaID/confirm")
  async confirmUpload(
    @Param("mediaID", new ParseUUIDPipe()) mediaID: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmUploadDto,
  ) {
    const media = await this.mediaService.confirmUpload(mediaID, user.sub);
    return {
      id: media.id,
      status: media.status,
      etag: dto.etag ?? null,
    };
  }
}
