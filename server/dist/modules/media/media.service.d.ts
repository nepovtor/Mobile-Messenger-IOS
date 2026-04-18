import { Repository } from "typeorm";
import { MediaEntity } from "../../entities/media.entity";
import { RequestUploadUrlDto } from "./dto/request-upload-url.dto";
export declare class MediaService {
    private readonly mediaRepository;
    private readonly logger;
    private readonly bucket;
    private readonly s3Client;
    private bucketEnsured;
    constructor(mediaRepository: Repository<MediaEntity>);
    createUploadUrl(userID: string, dto: RequestUploadUrlDto): Promise<{
        mediaID: string;
        uploadURL: string;
        objectKey: string;
    }>;
    confirmUpload(mediaID: string, userID: string): Promise<MediaEntity>;
    getUploadedMediaOrFail(mediaID: string): Promise<MediaEntity>;
    buildDownloadUrl(media: MediaEntity | null): Promise<string | null>;
    private ensureBucketExists;
}
