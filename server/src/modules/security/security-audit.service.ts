import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  SecurityActorType,
  SecurityAuditEventEntity,
  SecurityAuditOutcome,
} from "../../entities/security-audit-event.entity";

export type SecurityAuditInput = {
  eventType: string;
  actorType: SecurityActorType;
  actorId?: string | null;
  outcome: SecurityAuditOutcome;
  requestId?: string | null;
  ipHash?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

@Injectable()
export class SecurityAuditService {
  constructor(
    @InjectRepository(SecurityAuditEventEntity)
    private readonly eventsRepository: Repository<SecurityAuditEventEntity>,
  ) {}

  async record(input: SecurityAuditInput): Promise<void> {
    await this.eventsRepository.save(
      this.eventsRepository.create({
        eventType: input.eventType,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        outcome: input.outcome,
        requestId: input.requestId ?? null,
        ipHash: input.ipHash ?? null,
        metadata: sanitizeAuditMetadata(input.metadata ?? {}),
      }),
    );
  }
}

const FORBIDDEN_METADATA_KEYS = new Set([
  "password",
  "otp",
  "code",
  "token",
  "secret",
  "phone",
  "contact",
  "ciphertext",
  "latitude",
  "longitude",
]);

export function sanitizeAuditMetadata(
  metadata: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) =>
      FORBIDDEN_METADATA_KEYS.has(key.toLowerCase()) ? [] : [[key, value]],
    ),
  );
}
