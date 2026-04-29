import { RequestCodeDto } from "./request-code.dto";
export declare class VerifyCodeDto extends RequestCodeDto {
    code: string;
    displayName?: string;
}
