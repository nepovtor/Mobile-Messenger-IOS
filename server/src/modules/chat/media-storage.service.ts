import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

interface MediaUploadRecord {
  mediaID: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  filePath: string;
  publicURL: string;
  etag: string | null;
  confirmedAt: Date | null;
}

@Injectable()
export class MediaStorageService {
  private readonly uploads = new Map<string, MediaUploadRecord>();
  private readonly uploadDirectory = join(process.cwd(), "uploads", "media");

  async createUploadTarget(input: {
    mimeType: string;
    sizeBytes: number;
    width?: number;
    height?: number;
    baseURL: string;
  }) {
    const mediaID = randomUUID();
    const objectKey = `media/${mediaID}`;

    await mkdir(this.uploadDirectory, { recursive: true });

    this.uploads.set(mediaID, {
      mediaID,
      objectKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      filePath: join(this.uploadDirectory, mediaID),
      publicURL: `${input.baseURL}/api/media/${mediaID}`,
      etag: null,
      confirmedAt: null,
    });

    return {
      mediaID,
      objectKey,
      uploadURL: `${input.baseURL}/api/media/upload/${mediaID}`,
    };
  }

  async saveUpload(mediaID: string, data: Buffer, mimeType?: string) {
    const record = this.requireUpload(mediaID);

    if (data.length === 0) {
      throw new BadRequestException("Upload body is empty");
    }
    if (data.length > record.sizeBytes) {
      throw new BadRequestException("Uploaded file exceeds declared size");
    }
    if (mimeType && record.mimeType !== mimeType) {
      record.mimeType = mimeType;
    }

    await mkdir(this.uploadDirectory, { recursive: true });
    await writeFile(record.filePath, data);

    const etag = `"${createHash("sha1").update(data).digest("hex")}"`;
    record.etag = etag;
    this.uploads.set(mediaID, record);

    return { etag };
  }

  confirmUpload(mediaID: string, etag?: string) {
    const record = this.requireUpload(mediaID);

    if (!record.etag) {
      throw new BadRequestException("Upload not found");
    }
    if (etag && etag !== record.etag) {
      throw new BadRequestException("Upload etag mismatch");
    }

    record.confirmedAt = new Date();
    this.uploads.set(mediaID, record);

    return {
      mediaID: record.mediaID,
      mediaURL: record.publicURL,
    };
  }

  resolveConfirmedMedia(mediaID: string) {
    const record = this.requireUpload(mediaID);
    if (!record.confirmedAt) {
      throw new BadRequestException("Media upload is not confirmed");
    }

    return {
      mediaID: record.mediaID,
      mediaURL: record.publicURL,
    };
  }

  getMediaFile(mediaID: string) {
    const record = this.requireUpload(mediaID);
    if (!record.confirmedAt) {
      throw new NotFoundException("Media not found");
    }

    return {
      filePath: record.filePath,
      mimeType: record.mimeType,
      etag: record.etag,
    };
  }

  private requireUpload(mediaID: string): MediaUploadRecord {
    const record = this.uploads.get(mediaID.toLowerCase()) ?? this.uploads.get(mediaID);
    if (!record) {
      throw new NotFoundException("Media upload not found");
    }
    return record;
  }
}
