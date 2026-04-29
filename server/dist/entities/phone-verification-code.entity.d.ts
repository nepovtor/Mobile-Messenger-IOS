export declare class PhoneVerificationCodeEntity {
    id: `${string}-${string}-${string}-${string}-${string}`;
    phone: string;
    codeHash: string;
    expiresAt: Date;
    attempts: number;
    consumedAt: Date | null;
    createdAt: Date;
    resendAvailableAt: Date;
    requestIP: string | null;
    userAgent: string | null;
}
