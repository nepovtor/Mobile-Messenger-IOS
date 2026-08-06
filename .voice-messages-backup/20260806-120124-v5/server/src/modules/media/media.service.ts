import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  ChecksumMode,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
import { Repository } from "typeorm";
import {
  EncryptedAttachmentEntity,
  EncryptedAttachmentStatus,
} from "../../entities/encrypted-attachment.entity";
import { MediaEntity, MediaStatus } from "../../entities/media.entity";
import {
  getS3AccessKey,
  getS3Endpoint,
  getS3PublicEndpoint,
  getS3Region,
  getS3SecretKey,
  isE2EERequired,
  isProductionEnv,
  isS3ForcePathStyle,
} from "../common/runtime-config";
import { RequestEncryptedUploadUrlDto } from "./dto/request-encrypted-upload-url.dto";
import { RequestUploadUrlDto } from "./dto/request-upload-url.dto";

const ENCRYPTED_CONTENT_TYPE = "application/octet-stream";
const PRESIGNED_UPLOAD_TTL_SECONDS = 5 * 60;
const PRESIGNED_DOWNLOAD_TTL_SECONDS = 5 * 60;
const PENDING_UPLOAD_TTL_MS = 15 * 60 * 1000;
const UPLOADED_ATTACHMENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LEGACY_IMAGE_BYTES = 20_000_000;
const MAX_LEGACY_AUDIO_BYTES = 20_000_000;
const ALLOWED_LEGACY_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_LEGACY_AUDIO_TYPES = new Set(["audio/mp4"]);
const ALLOWED_LEGACY_MEDIA_TYPES = new Set([
  ...ALLOWED_LEGACY_IMAGE_TYPES,
  ...ALLOWED_LEGACY_AUDIO_TYPES,
]);

type StorageClients = {
  bucket: string;
  s3: S3Client;
  signer: S3Client;
};

@Injectable()
export class MediaService {
  private readonly storage = createStorageClients();
  private bucketAccessCheck: Promise<void> | null = null;

  constructor(
    @InjectRepository(MediaEntity)
    private readonly mediaRepository: Repository<MediaEntity>,
    @InjectRepository(EncryptedAttachmentEntity)
    private readonly encryptedAttachmentsRepository: Repository<EncryptedAttachmentEntity>,
  ) {}

  async createEncryptedUploadUrl(
    userID: string,
    dto: RequestEncryptedUploadUrlDto,
  ): Promise<{
    attachmentID: string;
    uploadURL: string;
    expiresIn: number;
    requiredHeaders: Record<string, string>;
  }> {
    const storage = this.requireStorage();
    await this.assertBucketAccessible(storage);

    const checksumBase64 = Buffer.from(dto.ciphertextSha256, "hex").toString(
      "base64",
    );
    const attachment = this.encryptedAttachmentsRepository.create({
      objectKey: `encrypted/v1/${randomUUID()}/${randomUUID()}.bin`,
      uploadedById: userID,
      sizeBytes: dto.sizeBytes,
      ciphertextHash: dto.ciphertextSha256.toLowerCase(),
      status: EncryptedAttachmentStatus.PENDING,
      uploadedAt: null,
      expiresAt: new Date(Date.now() + PENDING_UPLOAD_TTL_MS),
    });
    const saved = await this.encryptedAttachmentsRepository.save(attachment);
    const command = new PutObjectCommand({
      Bucket: storage.bucket,
      Key: saved.objectKey,
      Body: undefined,
      ContentLength: saved.sizeBytes,
      ContentType: ENCRYPTED_CONTENT_TYPE,
      ChecksumSHA256: checksumBase64,
      Metadata: {
        "ciphertext-sha256": saved.ciphertextHash,
      },
    });
    const uploadURL = await getSignedUrl(storage.signer, command, {
      expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS,
    });

    return {
      attachmentID: saved.id,
      uploadURL,
      expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS,
      requiredHeaders: {
        "content-type": ENCRYPTED_CONTENT_TYPE,
        "x-amz-checksum-sha256": checksumBase64,
        "x-amz-meta-ciphertext-sha256": saved.ciphertextHash,
      },
    };
  }

  async confirmEncryptedUpload(
    attachmentID: string,
    userID: string,
  ): Promise<EncryptedAttachmentEntity> {
    const attachment = await this.requireOwnedEncryptedAttachment(
      attachmentID,
      userID,
    );
    if (attachment.status === EncryptedAttachmentStatus.UPLOADED) {
      return attachment;
    }
    if (
      attachment.status !== EncryptedAttachmentStatus.PENDING ||
      attachment.expiresAt.getTime() <= Date.now()
    ) {
      attachment.status = EncryptedAttachmentStatus.EXPIRED;
      await this.encryptedAttachmentsRepository.save(attachment);
      throw new BadRequestException("Encrypted upload has expired");
    }

    const storage = this.requireStorage();
    await this.assertBucketAccessible(storage);
    const uploadedObject = await this.headObjectWithRetry(
      storage,
      attachment.objectKey,
    );
    assertObjectSize(uploadedObject.ContentLength, attachment.sizeBytes);
    if (uploadedObject.ContentType !== ENCRYPTED_CONTENT_TYPE) {
      throw new BadRequestException(
        "Encrypted attachment content type does not match",
      );
    }

    const declaredHash =
      uploadedObject.Metadata?.["ciphertext-sha256"]?.toLowerCase();
    if (declaredHash !== attachment.ciphertextHash) {
      throw new BadRequestException(
        "Encrypted attachment hash metadata does not match",
      );
    }
    if (
      uploadedObject.ChecksumSHA256 &&
      uploadedObject.ChecksumSHA256 !==
        Buffer.from(attachment.ciphertextHash, "hex").toString("base64")
    ) {
      throw new BadRequestException(
        "Encrypted attachment checksum does not match",
      );
    }

    attachment.status = EncryptedAttachmentStatus.UPLOADED;
    attachment.uploadedAt = new Date();
    attachment.expiresAt = new Date(
      Date.now() + UPLOADED_ATTACHMENT_RETENTION_MS,
    );
    return this.encryptedAttachmentsRepository.save(attachment);
  }

  async createEncryptedDownloadUrl(
    attachmentID: string,
    userID: string,
  ): Promise<{ downloadURL: string; expiresIn: number }> {
    const attachment = await this.requireOwnedEncryptedAttachment(
      attachmentID,
      userID,
    );
    if (attachment.status !== EncryptedAttachmentStatus.UPLOADED) {
      throw new BadRequestException("Encrypted attachment is not available");
    }
    if (attachment.expiresAt.getTime() <= Date.now()) {
      attachment.status = EncryptedAttachmentStatus.EXPIRED;
      await this.encryptedAttachmentsRepository.save(attachment);
      throw new NotFoundException("Encrypted attachment has expired");
    }

    const storage = this.requireStorage();
    await this.assertBucketAccessible(storage);
    const downloadURL = await getSignedUrl(
      storage.signer,
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: attachment.objectKey,
        ResponseContentType: ENCRYPTED_CONTENT_TYPE,
        ResponseContentDisposition: 'attachment; filename="encrypted.bin"',
      }),
      { expiresIn: PRESIGNED_DOWNLOAD_TTL_SECONDS },
    );
    return {
      downloadURL,
      expiresIn: PRESIGNED_DOWNLOAD_TTL_SECONDS,
    };
  }

  async getUploadedEncryptedAttachmentOrFail(
    attachmentID: string,
    ownerUserID: string,
  ): Promise<EncryptedAttachmentEntity> {
    const attachment = await this.requireOwnedEncryptedAttachment(
      attachmentID,
      ownerUserID,
    );
    if (attachment.status !== EncryptedAttachmentStatus.UPLOADED) {
      throw new BadRequestException("Encrypted attachment is not available");
    }
    return attachment;
  }

  async createUploadUrl(
    userID: string,
    dto: RequestUploadUrlDto,
  ): Promise<{
    mediaID: string;
    uploadURL: string;
    objectKey: string;
  }> {
    this.assertLegacyMediaAllowed();
    if (!ALLOWED_LEGACY_IMAGE_TYPES.has(dto.mimeType)) {
      throw new BadRequestException(
        "Only JPEG, PNG, and WebP uploads are supported",
      );
    }

    const storage = this.requireStorage();
    await this.assertBucketAccessible(storage);
    const extension = legacyImageExtension(dto.mimeType);
    const media = this.mediaRepository.create({
      objectKey: `legacy-images/v1/${randomUUID()}/${randomUUID()}.${extension}`,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      width: dto.width ?? null,
      height: dto.height ?? null,
      uploadedById: userID,
      status: MediaStatus.PENDING,
    });

    const saved = await this.mediaRepository.save(media);
    const uploadURL = await getSignedUrl(
      storage.signer,
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: saved.objectKey,
        ContentLength: saved.sizeBytes,
        ContentType: saved.mimeType,
      }),
      { expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS },
    );

    return {
      mediaID: saved.id,
      uploadURL,
      objectKey: saved.objectKey,
    };
  }

  async confirmUpload(mediaID: string, userID: string): Promise<MediaEntity> {
    this.assertLegacyMediaAllowed();
    const media = await this.mediaRepository.findOneBy({
      id: mediaID as MediaEntity["id"],
    });
    if (!media) {
      throw new NotFoundException("Media not found");
    }
    if (media.uploadedById !== userID) {
      throw new ForbiddenException("Media belongs to another user");
    }
    if (media.status === MediaStatus.UPLOADED) {
      return media;
    }

    const storage = this.requireStorage();
    await this.assertBucketAccessible(storage);
    const uploadedObject = await this.headObjectWithRetry(
      storage,
      media.objectKey,
    );
    assertObjectSize(uploadedObject.ContentLength, media.sizeBytes);

    try {
      const result = await storage.s3.send(
        new GetObjectCommand({
          Bucket: storage.bucket,
          Key: media.objectKey,
        }),
      );
      if (!result.Body) {
        throw new BadRequestException("Uploaded image is empty");
      }
      const source = Buffer.from(await result.Body.transformToByteArray());
      if (source.length !== media.sizeBytes) {
        throw new BadRequestException("Uploaded image size does not match");
      }
      assertLegacyImageMagic(source, media.mimeType);

      const image = sharp(source, {
        animated: false,
        failOn: "error",
        limitInputPixels: 40_000_000,
      }).rotate();
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) {
        throw new BadRequestException("Uploaded image could not be decoded");
      }
      if (
        (media.width != null && media.width !== metadata.width) ||
        (media.height != null && media.height !== metadata.height)
      ) {
        throw new BadRequestException("Uploaded image dimensions do not match");
      }

      const sanitized = await reencodeLegacyImage(image, media.mimeType);
      if (sanitized.length > MAX_LEGACY_IMAGE_BYTES) {
        throw new BadRequestException("Re-encoded image is too large");
      }
      await storage.s3.send(
        new PutObjectCommand({
          Bucket: storage.bucket,
          Key: media.objectKey,
          Body: sanitized,
          ContentLength: sanitized.length,
          ContentType: media.mimeType,
        }),
      );

      media.sizeBytes = sanitized.length;
      media.width = metadata.width;
      media.height = metadata.height;
      media.status = MediaStatus.UPLOADED;
      return this.mediaRepository.save(media);
    } catch (error) {
      await this.deleteObjectBestEffort(storage, media.objectKey);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException("Uploaded image is invalid");
    }
  }

  async getUploadedMediaOrFail(mediaID: string): Promise<MediaEntity> {
    this.assertLegacyMediaAllowed();
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
    if (
      !media ||
      media.status !== MediaStatus.UPLOADED ||
      isE2EERequired() ||
      isProductionEnv()
    ) {
      return null;
    }

    const storage = this.requireStorage();
    await this.assertBucketAccessible(storage);
    return getSignedUrl(
      storage.signer,
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: media.objectKey,
        ResponseContentType: media.mimeType,
      }),
      { expiresIn: PRESIGNED_DOWNLOAD_TTL_SECONDS },
    );
  }

  private async requireOwnedEncryptedAttachment(
    attachmentID: string,
    userID: string,
  ): Promise<EncryptedAttachmentEntity> {
    const attachment = await this.encryptedAttachmentsRepository.findOneBy({
      id: attachmentID as EncryptedAttachmentEntity["id"],
    });
    if (!attachment) {
      throw new NotFoundException("Encrypted attachment not found");
    }
    if (attachment.uploadedById !== userID) {
      throw new NotFoundException("Encrypted attachment not found");
    }
    return attachment;
  }

  private requireStorage(): StorageClients {
    if (!this.storage) {
      throw new ServiceUnavailableException(
        "Private media storage is not configured",
      );
    }
    return this.storage;
  }

  private async assertBucketAccessible(storage: StorageClients): Promise<void> {
    this.bucketAccessCheck ??= storage.s3
      .send(new HeadBucketCommand({ Bucket: storage.bucket }))
      .then(() => undefined)
      .catch(() => {
        this.bucketAccessCheck = null;
        throw new ServiceUnavailableException(
          "Private media storage is unavailable",
        );
      });
    await this.bucketAccessCheck;
  }

  private async headObjectWithRetry(
    storage: StorageClients,
    objectKey: string,
  ) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await storage.s3.send(
          new HeadObjectCommand({
            Bucket: storage.bucket,
            Key: objectKey,
            ChecksumMode: ChecksumMode.ENABLED,
          }),
        );
      } catch {
        if (attempt === 3) {
          throw new BadRequestException("Uploaded file was not found");
        }
        await delay(attempt * 200);
      }
    }

    throw new BadRequestException("Uploaded file was not found");
  }

  private async deleteObjectBestEffort(
    storage: StorageClients,
    objectKey: string,
  ): Promise<void> {
    try {
      await storage.s3.send(
        new DeleteObjectCommand({
          Bucket: storage.bucket,
          Key: objectKey,
        }),
      );
    } catch {
      // The original validation error is safer and more useful than exposing
      // storage-provider details. Expired-object cleanup can retry later.
    }
  }

  private assertLegacyMediaAllowed(): void {
    if (isE2EERequired() || isProductionEnv()) {
      throw new ForbiddenException(
        "Legacy plaintext media uploads are disabled",
      );
    }
  }
}

function createStorageClients(): StorageClients | null {
  const accessKeyId = getS3AccessKey();
  const secretAccessKey = getS3SecretKey();
  const bucket = process.env["S3_BUCKET"]?.trim();
  const region = getS3Region().trim();
  if (!accessKeyId || !secretAccessKey || !bucket || !region) {
    return null;
  }

  const common = {
    region,
    forcePathStyle: isS3ForcePathStyle(),
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  };
  return {
    bucket,
    s3: new S3Client({
      ...common,
      endpoint: getS3Endpoint() ?? undefined,
    }),
    signer: new S3Client({
      ...common,
      endpoint: getS3PublicEndpoint() ?? undefined,
    }),
  };
}

function assertObjectSize(
  actualSize: number | undefined,
  expectedSize: number,
): void {
  if (actualSize == null || actualSize !== expectedSize) {
    throw new BadRequestException("Uploaded file size does not match");
  }
}

function legacyImageExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new BadRequestException("Unsupported image type");
  }
}

function assertLegacyImageMagic(source: Buffer, mimeType: string): void {
  const isJpeg =
    source.length >= 3 &&
    source[0] === 0xff &&
    source[1] === 0xd8 &&
    source[2] === 0xff;
  const isPng =
    source.length >= 8 &&
    source
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp =
    source.length >= 12 &&
    source.subarray(0, 4).toString("ascii") === "RIFF" &&
    source.subarray(8, 12).toString("ascii") === "WEBP";
  const matches =
    (mimeType === "image/jpeg" && isJpeg) ||
    (mimeType === "image/png" && isPng) ||
    (mimeType === "image/webp" && isWebp);
  if (!matches) {
    throw new BadRequestException("Uploaded image type does not match");
  }
}

async function reencodeLegacyImage(
  image: sharp.Sharp,
  mimeType: string,
): Promise<Buffer> {
  switch (mimeType) {
    case "image/jpeg":
      return image.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    case "image/png":
      return image.png({ compressionLevel: 9 }).toBuffer();
    case "image/webp":
      return image.webp({ quality: 90 }).toBuffer();
    default:
      throw new BadRequestException("Unsupported image type");
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
