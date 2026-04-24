import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import {
  getAuthRateLimitMaxRequests,
  getAuthRateLimitWindowMs,
} from "../common/runtime-config";

@Injectable()
export class AuthRateLimitService {
  private readonly attempts = new Map<string, number[]>();
  private readonly windowMs = getAuthRateLimitWindowMs();
  private readonly maxRequests = getAuthRateLimitMaxRequests();

  consume(key: string): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const current = (this.attempts.get(key) ?? []).filter(
      (timestamp) => timestamp >= windowStart,
    );

    if (current.length >= this.maxRequests) {
      throw new HttpException(
        "Too many auth attempts",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.push(now);
    this.attempts.set(key, current);
  }
}
