import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

type Bucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class AdminRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  consume(key: string, maxRequests = 10, windowMs = 60_000): void {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }
    existing.count += 1;
    if (existing.count > maxRequests) {
      throw new HttpException(
        "Too many admin authentication attempts",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
