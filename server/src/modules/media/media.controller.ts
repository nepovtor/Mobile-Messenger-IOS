import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/authenticated-user";
import { ConfirmUploadDto } from "./dto/confirm-upload.dto";
import { RequestEncryptedUploadUrlDto } from "./dto/request-encrypted-upload-url.dto";
import { RequestUploadUrlDto } from "./dto/request-upload-url.dto";
import { MediaService } from "./media.service";

const MAX_VOICE_UPLOAD_BYTES = 20_000_000;

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

  @Post("voice")
  async uploadVoice(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const mimeType = request.headers["content-type"]
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (mimeType !== "audio/mp4" && mimeType !== "audio/webm") {
      throw new BadRequestException(
        "Only M4A/AAC and WebM/Opus voice uploads are supported",
      );
    }

    const source = await readRequestBody(request, MAX_VOICE_UPLOAD_BYTES);
    const media = await this.mediaService.uploadVoice(
      user.sub,
      source,
      mimeType,
    );
    return {
      mediaID: media.id,
      status: media.status,
    };
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

async function readRequestBody(request: Request, maxBytes: number) {
  const declaredSize = Number(request.headers["content-length"] ?? "0");
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new BadRequestException("Voice message is too large");
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw new BadRequestException("Voice message is too large");
    }
    chunks.push(buffer);
  }
  if (size === 0) {
    throw new BadRequestException("Voice message is empty");
  }
  return Buffer.concat(chunks, size);
}
