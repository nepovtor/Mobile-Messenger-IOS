export declare class AuthRateLimitService {
    private readonly attempts;
    private readonly windowMs;
    private readonly maxRequests;
    consume(key: string, options?: {
        windowMs?: number;
        maxRequests?: number;
        message?: string;
    }): void;
}
