import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/authenticated-user";
import { ConfirmUploadDto } from "./dto/confirm-upload.dto";
import { RequestEncryptedUploadUrlDto } from "./dto/request-encrypted-upload-url.dto";
import { RequestUploadUrlDto } from "./dto/request-upload-url.dto";
import { MediaService } from "./media.service";

@Controller("media")
@UseGuards(AuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post("encrypted/upload-url")
  createEncryptedUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestEncryptedUploadUrlDto,
  ) {
    return this.mediaService.createEncryptedUploadUrl(user.sub, dto);
  }

  @Post("encrypted/:attachmentID/confirm")
  async confirmEncryptedUpload(
    @Param("attachmentID", new ParseUUIDPipe()) attachmentID: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const attachment = await this.mediaService.confirmEncryptedUpload(
      attachmentID,
      user.sub,
    );
    return {
      attachmentID: attachment.id,
      status: attachment.status,
      sizeBytes: attachment.sizeBytes,
      ciphertextSha256: attachment.ciphertextHash,
    };
  }

  @Get("encrypted/:attachmentID/download-url")
  createEncryptedDownloadUrl(
    @Param("attachmentID", new ParseUUIDPipe()) attachmentID: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mediaService.createEncryptedDownloadUrl(attachmentID, user.sub);
  }

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
