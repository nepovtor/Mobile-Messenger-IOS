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

  consume(
    key: string,
    options?: {
      windowMs?: number;
      maxRequests?: number;
      message?: string;
    },
  ): void {
    const now = Date.now();
    const windowMs = options?.windowMs ?? this.windowMs;
    const maxRequests = options?.maxRequests ?? this.maxRequests;
    const message = options?.message ?? "Too many auth attempts";
    const windowStart = now - windowMs;
    const current = (this.attempts.get(key) ?? []).filter(
      (timestamp) => timestamp >= windowStart,
    );

    if (current.length >= maxRequests) {
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }

    current.push(now);
    this.attempts.set(key, current);
  }
}
