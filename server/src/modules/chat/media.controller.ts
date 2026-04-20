import { createReadStream } from "node:fs";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthenticatedRequest } from "../../auth.types";
import { JwtAuthGuard } from "../../jwt-auth.guard";
import { ConfirmUploadDto } from "./dto/confirm-upload.dto";
import { RequestUploadUrlDto } from "./dto/request-upload-url.dto";
import { MediaStorageService } from "./media-storage.service";

@Controller("media")
export class MediaController {
  constructor(private readonly mediaStorageService: MediaStorageService) {}

  @Post("upload-url")
  @UseGuards(JwtAuthGuard)
  requestUploadUrl(
    @Body() body: RequestUploadUrlDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const baseURL = `${request.protocol}://${request.get("host")}`;
    return this.mediaStorageService.createUploadTarget({
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      width: body.width,
      height: body.height,
      baseURL,
    });
  }

  @Put("upload/:mediaID")
  async uploadMedia(
    @Param("mediaID") mediaID: string,
    @Req() request: Request & { body: Buffer },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.mediaStorageService.saveUpload(
      mediaID,
      Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
      request.header("content-type") ?? undefined,
    );
    response.setHeader("ETag", result.etag);
    return { ok: true };
  }

  @Post(":mediaID/confirm")
  @UseGuards(JwtAuthGuard)
  confirmUpload(
    @Param("mediaID") mediaID: string,
    @Body() body: ConfirmUploadDto,
  ) {
    return this.mediaStorageService.confirmUpload(mediaID, body.etag);
  }

  @Get(":mediaID")
  getMedia(
    @Param("mediaID") mediaID: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = this.mediaStorageService.getMediaFile(mediaID);
    response.setHeader("Content-Type", file.mimeType);
    if (file.etag) {
      response.setHeader("ETag", file.etag);
    }

    return new StreamableFile(createReadStream(file.filePath));
  }
}
