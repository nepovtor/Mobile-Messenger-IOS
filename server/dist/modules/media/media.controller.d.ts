import { AuthenticatedUser } from "../common/authenticated-user";
import { ConfirmUploadDto } from "./dto/confirm-upload.dto";
import { RequestUploadUrlDto } from "./dto/request-upload-url.dto";
import { MediaService } from "./media.service";
export declare class MediaController {
    private readonly mediaService;
    constructor(mediaService: MediaService);
    createUploadUrl(user: AuthenticatedUser, dto: RequestUploadUrlDto): Promise<{
        mediaID: string;
        uploadURL: string;
        objectKey: string;
    }>;
    confirmUpload(mediaID: string, user: AuthenticatedUser, dto: ConfirmUploadDto): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
        status: import("../../entities/media.entity").MediaStatus;
        etag: string | null;
    }>;
}
