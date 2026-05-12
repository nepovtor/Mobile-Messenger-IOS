import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Repository } from "typeorm";
import { MediaEntity, MediaStatus } from "../../entities/media.entity";
import {
  getS3Bucket,
  getS3Endpoint,
  getS3PublicEndpoint,
  getS3Region,
  isS3ForcePathStyle,
} from "../common/runtime-config";
import { RequestUploadUrlDto } from "./dto/request-upload-url.dto";

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly bucket = getS3Bucket();
  private readonly region = getS3Region();
  private readonly endpoint = getS3Endpoint() ?? undefined;
  private readonly publicEndpoint = getS3PublicEndpoint() ?? undefined;
  private readonly forcePathStyle = isS3ForcePathStyle();
  private readonly credentials = {
    accessKeyId: process.env["S3_ACCESS_KEY"] || "minioadmin",
    secretAccessKey: process.env["S3_SECRET_KEY"] || "minioadmin",
  };
  private readonly s3Client = new S3Client({
    endpoint: this.endpoint,
    region: this.region,
    forcePathStyle: this.forcePathStyle,
    credentials: this.credentials,
  });
  private readonly signingS3Client = new S3Client({
    endpoint: this.publicEndpoint,
    region: this.region,
    forcePathStyle: this.forcePathStyle,
    credentials: this.credentials,
  });
  private bucketEnsured = false;

  constructor(
    @InjectRepository(MediaEntity)
    private readonly mediaRepository: Repository<MediaEntity>,
  ) {}

  async createUploadUrl(
    userID: string,
    dto: RequestUploadUrlDto,
  ): Promise<{
    mediaID: string;
    uploadURL: string;
    objectKey: string;
  }> {
    if (!dto.mimeType.startsWith("image/")) {
      throw new BadRequestException("Only image uploads are supported");
    }

    await this.ensureBucketExists();

    const media = this.mediaRepository.create({
      objectKey: `uploads/${userID}/${randomUUID()}`,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      width: dto.width ?? null,
      height: dto.height ?? null,
      uploadedById: userID,
      status: MediaStatus.PENDING,
    });

    const saved = await this.mediaRepository.save(media);
    const uploadURL = await getSignedUrl(
      this.signingS3Client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: saved.objectKey,
        ContentType: saved.mimeType,
      }),
      { expiresIn: 900 },
    );

    return {
      mediaID: saved.id,
      uploadURL,
      objectKey: saved.objectKey,
    };
  }

  async confirmUpload(mediaID: string, userID: string): Promise<MediaEntity> {
    const media = await this.mediaRepository.findOneBy({
      id: mediaID as MediaEntity["id"],
    });
    if (!media) {
      throw new NotFoundException("Media not found");
    }
    if (media.uploadedById !== userID) {
      throw new BadRequestException("Media belongs to another user");
    }

    await this.ensureBucketExists();
    await this.waitUntilUploadIsAccessible(media);

    media.status = MediaStatus.UPLOADED;
    return this.mediaRepository.save(media);
  }

  async getUploadedMediaOrFail(mediaID: string): Promise<MediaEntity> {
    const media = await this.mediaRepository.findOneBy({
      id: mediaID as MediaEntity["id"],
    });
    if (!media) {
      throw new NotFoundException("Media not found");
    }
    if (media.status !== MediaStatus.UPLOADED) {
      throw new BadRequestException("Media upload is not confirmed");
    }
    return media;
  }

  async buildDownloadUrl(media: MediaEntity | null): Promise<string | null> {
    if (!media) {
      return null;
    }
    if (media.status !== MediaStatus.UPLOADED) {
      return null;
    }

    await this.ensureBucketExists();
    return getSignedUrl(
      this.signingS3Client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: media.objectKey,
      }),
      { expiresIn: 3600 },
    );
  }

  private async waitUntilUploadIsAccessible(media: MediaEntity): Promise<void> {
    const maxAttempts = 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const uploadedObject = await this.s3Client.send(
          new HeadObjectCommand({
            Bucket: this.bucket,
            Key: media.objectKey,
          }),
        );
        if (
          uploadedObject.ContentLength !== undefined &&
          uploadedObject.ContentLength !== null &&
          uploadedObject.ContentLength !== media.sizeBytes
        ) {
          throw new BadRequestException("Uploaded media size does not match");
        }
        return;
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }

        if (attempt === maxAttempts) {
          this.logger.warn(
            `Upload confirmation failed for ${media.objectKey}: object is not accessible yet`,
          );
          throw new BadRequestException("Uploaded media file was not found");
        }

        await this.delay(attempt * 250);
      }
    }
  }

  private async ensureBucketExists(): Promise<void> {
    if (this.bucketEnsured) {
      return;
    }

    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.bucketEnsured = true;
      return;
    } catch (error) {
      this.logger.warn(
        `Bucket ${this.bucket} was not found yet, creating it now`,
      );
      try {
        await this.s3Client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.bucketEnsured = true;
      } catch (createError) {
        this.logger.error("Failed to ensure S3 bucket", createError as Error);
        throw new InternalServerErrorException("Failed to access media bucket");
      }
    }
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
