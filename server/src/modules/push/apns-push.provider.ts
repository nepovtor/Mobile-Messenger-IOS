import { createSign } from "node:crypto";
import { ClientHttp2Session, ClientHttp2Stream, connect } from "node:http2";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { PushEnvironment } from "../../entities/push-subscription.entity";
import { appLogger } from "../common/app-logger";
import { getApnsConfig } from "../common/runtime-config";
import type {
  GenericPushPayload,
  IosPushTarget,
  PushDeliveryResult,
} from "./push.types";

const GENERIC_ALERT_TITLE = "Mobile Messenger";
const GENERIC_ALERT_BODY = "Новое сообщение";
const APNS_REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER_TOKEN_TTL_MS = 50 * 60 * 1000;
const MAX_APNS_RESPONSE_BYTES = 4096;

const INVALID_APNS_REASONS = new Set([
  "BadDeviceToken",
  "DeviceTokenNotForTopic",
  "Unregistered",
]);

const APNS_ORIGINS: Record<PushEnvironment, string> = {
  sandbox: "https://api.sandbox.push.apple.com",
  production: "https://api.push.apple.com",
};

@Injectable()
export class ApnsPushProvider implements OnModuleDestroy {
  private readonly config = getApnsConfig();
  private readonly sessions = new Map<PushEnvironment, ClientHttp2Session>();
  private providerToken: { value: string; createdAt: number } | null = null;
  private didLogMissingConfig = false;

  isConfigured(): boolean {
    return Boolean(this.config);
  }

  async send(
    target: IosPushTarget,
    payload: GenericPushPayload,
  ): Promise<PushDeliveryResult> {
    if (!this.config) {
      this.logMissingConfig();
      return {
        ok: false,
        reason: "APNs is not configured.",
      };
    }

    try {
      const providerToken = this.getProviderToken();
      const body = JSON.stringify({
        aps: {
          alert: {
            title: GENERIC_ALERT_TITLE,
            body: GENERIC_ALERT_BODY,
          },
          sound: "default",
          ...(payload.badge == null ? {} : { badge: payload.badge }),
        },
        type: payload.type,
      });
      const response = await this.performRequest(
        target.environment,
        target.deviceToken,
        providerToken,
        body,
      );
      if (response.statusCode === 200) {
        return { ok: true };
      }

      const reason = parseApnsReason(response.body);
      if (reason === "ExpiredProviderToken") {
        this.providerToken = null;
      }
      return {
        ok: false,
        statusCode: response.statusCode,
        reason,
        invalidToken: INVALID_APNS_REASONS.has(reason),
      };
    } catch {
      this.dropSession(target.environment);
      return {
        ok: false,
        reason: "APNs delivery failed.",
      };
    }
  }

  onModuleDestroy(): void {
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();
  }

  private getProviderToken(): string {
    if (
      this.providerToken &&
      Date.now() - this.providerToken.createdAt < PROVIDER_TOKEN_TTL_MS
    ) {
      return this.providerToken.value;
    }
    if (!this.config) {
      throw new Error("APNs is not configured.");
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const encodedHeader = encodeJson({
      alg: "ES256",
      kid: this.config.keyId,
    });
    const encodedPayload = encodeJson({
      iss: this.config.teamId,
      iat: issuedAt,
    });
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signer = createSign("SHA256");
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign({
      key: this.config.privateKey,
      dsaEncoding: "ieee-p1363",
    });
    const value = `${signingInput}.${signature.toString("base64url")}`;
    this.providerToken = {
      value,
      createdAt: Date.now(),
    };
    return value;
  }

  private async performRequest(
    environment: PushEnvironment,
    deviceToken: string,
    providerToken: string,
    body: string,
  ): Promise<{ statusCode: number; body: string }> {
    if (!this.config) {
      throw new Error("APNs is not configured.");
    }

    const session = this.getSession(environment);
    const stream = session.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken}`,
      "apns-topic": this.config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    return readApnsResponse(stream, body);
  }

  private getSession(environment: PushEnvironment): ClientHttp2Session {
    const existing = this.sessions.get(environment);
    if (existing && !existing.closed && !existing.destroyed) {
      return existing;
    }

    const session = connect(APNS_ORIGINS[environment]);
    session.on("error", () => {
      this.dropSession(environment, session);
    });
    session.on("close", () => {
      this.dropSession(environment, session);
    });
    this.sessions.set(environment, session);
    return session;
  }

  private dropSession(
    environment: PushEnvironment,
    expected?: ClientHttp2Session,
  ): void {
    const existing = this.sessions.get(environment);
    if (!existing || (expected && existing !== expected)) {
      return;
    }
    this.sessions.delete(environment);
    if (!existing.closed && !existing.destroyed) {
      existing.destroy();
    }
  }

  private logMissingConfig(): void {
    if (this.didLogMissingConfig) {
      return;
    }

    this.didLogMissingConfig = true;
    void appLogger.info(
      "push.apns",
      "APNs is disabled because Apple push credentials are missing.",
    );
  }
}

function encodeJson(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function readApnsResponse(
  stream: ClientHttp2Stream,
  requestBody: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    let statusCode = 0;
    let responseBody = "";
    let settled = false;

    const rejectOnce = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    stream.setEncoding("utf8");
    stream.setTimeout(APNS_REQUEST_TIMEOUT_MS, () => {
      stream.close();
      rejectOnce(new Error("APNs request timed out"));
    });
    stream.on("response", (headers) => {
      const status = headers[":status"];
      statusCode = typeof status === "number" ? status : Number(status ?? 0);
    });
    stream.on("data", (chunk: string) => {
      if (responseBody.length >= MAX_APNS_RESPONSE_BYTES) {
        return;
      }
      responseBody += chunk.slice(
        0,
        MAX_APNS_RESPONSE_BYTES - responseBody.length,
      );
    });
    stream.on("end", () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ statusCode, body: responseBody });
    });
    stream.on("error", rejectOnce);
    stream.end(requestBody);
  });
}

function parseApnsReason(body: string): string {
  try {
    const parsed = JSON.parse(body) as { reason?: unknown };
    if (typeof parsed.reason === "string" && parsed.reason.length <= 100) {
      return parsed.reason;
    }
  } catch {
    // Return a generic error without leaking provider response bodies.
  }
  return "APNs delivery failed.";
}
