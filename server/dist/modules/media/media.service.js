"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MediaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const typeorm_2 = require("typeorm");
const media_entity_1 = require("../../entities/media.entity");
let MediaService = MediaService_1 = class MediaService {
    constructor(mediaRepository) {
        this.mediaRepository = mediaRepository;
        this.logger = new common_1.Logger(MediaService_1.name);
        this.bucket = process.env.S3_BUCKET || "messenger-media";
        this.s3Client = new client_s3_1.S3Client({
            endpoint: process.env.S3_ENDPOINT,
            region: process.env.S3_REGION || "us-east-1",
            forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || "true") === "true",
            credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
                secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
            },
        });
        this.bucketEnsured = false;
    }
    async createUploadUrl(userID, dto) {
        if (!dto.mimeType.startsWith("image/")) {
            throw new common_1.BadRequestException("Only image uploads are supported");
        }
        await this.ensureBucketExists();
        const media = this.mediaRepository.create({
            objectKey: `uploads/${userID}/${(0, node_crypto_1.randomUUID)()}`,
            mimeType: dto.mimeType,
            sizeBytes: dto.sizeBytes,
            width: dto.width ?? null,
            height: dto.height ?? null,
            uploadedById: userID,
            status: media_entity_1.MediaStatus.PENDING,
        });
        const saved = await this.mediaRepository.save(media);
        const uploadURL = await (0, s3_request_presigner_1.getSignedUrl)(this.s3Client, new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: saved.objectKey,
            ContentType: saved.mimeType,
        }), { expiresIn: 900 });
        return {
            mediaID: saved.id,
            uploadURL,
            objectKey: saved.objectKey,
        };
    }
    async confirmUpload(mediaID, userID) {
        const media = await this.mediaRepository.findOneBy({
            id: mediaID,
        });
        if (!media) {
            throw new common_1.NotFoundException("Media not found");
        }
        if (media.uploadedById !== userID) {
            throw new common_1.BadRequestException("Media belongs to another user");
        }
        await this.ensureBucketExists();
        try {
            const uploadedObject = await this.s3Client.send(new client_s3_1.HeadObjectCommand({
                Bucket: this.bucket,
                Key: media.objectKey,
            }));
            if (uploadedObject.ContentLength !== undefined &&
                uploadedObject.ContentLength !== null &&
                uploadedObject.ContentLength !== media.sizeBytes) {
                throw new common_1.BadRequestException("Uploaded media size does not match");
            }
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            this.logger.warn(`Upload confirmation failed for ${media.objectKey}: object is not accessible yet`);
            throw new common_1.BadRequestException("Uploaded media file was not found");
        }
        media.status = media_entity_1.MediaStatus.UPLOADED;
        return this.mediaRepository.save(media);
    }
    async getUploadedMediaOrFail(mediaID) {
        const media = await this.mediaRepository.findOneBy({
            id: mediaID,
        });
        if (!media) {
            throw new common_1.NotFoundException("Media not found");
        }
        if (media.status !== media_entity_1.MediaStatus.UPLOADED) {
            throw new common_1.BadRequestException("Media upload is not confirmed");
        }
        return media;
    }
    async buildDownloadUrl(media) {
        if (!media) {
            return null;
        }
        if (media.status !== media_entity_1.MediaStatus.UPLOADED) {
            return null;
        }
        await this.ensureBucketExists();
        return (0, s3_request_presigner_1.getSignedUrl)(this.s3Client, new client_s3_1.GetObjectCommand({
            Bucket: this.bucket,
            Key: media.objectKey,
        }), { expiresIn: 3600 });
    }
    async ensureBucketExists() {
        if (this.bucketEnsured) {
            return;
        }
        try {
            await this.s3Client.send(new client_s3_1.HeadBucketCommand({ Bucket: this.bucket }));
            this.bucketEnsured = true;
            return;
        }
        catch (error) {
            this.logger.warn(`Bucket ${this.bucket} was not found yet, creating it now`);
            try {
                await this.s3Client.send(new client_s3_1.CreateBucketCommand({ Bucket: this.bucket }));
                this.bucketEnsured = true;
            }
            catch (createError) {
                this.logger.error("Failed to ensure S3 bucket", createError);
                throw new common_1.InternalServerErrorException("Failed to access media bucket");
            }
        }
    }
};
exports.MediaService = MediaService;
exports.MediaService = MediaService = MediaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(media_entity_1.MediaEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], MediaService);
//# sourceMappingURL=media.service.js.map