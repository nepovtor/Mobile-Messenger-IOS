export declare enum AuthMethodDto {
    Phone = "phone"
}
export declare class RequestCodeDto {
    method: AuthMethodDto;
    contact: string;
}
