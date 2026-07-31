import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  QueryFailedError,
  Repository,
} from "typeorm";
import { ChatParticipantEntity } from "../../entities/chat-participant.entity";
import { ChatEntity } from "../../entities/chat.entity";
import {
  ContactRequestEntity,
  ContactRequestStatus,
} from "../../entities/contact-request.entity";
import { EncryptedMessageEnvelopeEntity } from "../../entities/encrypted-message-envelope.entity";
import {
  EncryptedMessageEntity,
  EncryptedMessageType,
} from "../../entities/encrypted-message.entity";
import { UserDeviceEntity } from "../../entities/user-device.entity";
import {
  SecurityActorType,
  SecurityAuditOutcome,
} from "../../entities/security-audit-event.entity";
import { AuthRateLimitService } from "../auth/auth-rate-limit.service";
import { AuthenticatedUser } from "../common/authenticated-user";
import { decodeStrictBase64 } from "../devices/base64";
import { DevicesService } from "../devices/devices.service";
import { RealtimeService } from "../realtime/realtime.service";
import { SecurityAuditService } from "../security/security-audit.service";
import { EncryptedInboxQueryDto } from "./dto/inbox-query.dto";
import {
  EncryptedEnvelopeDto,
  SubmitEncryptedMessageDto,
} from "./dto/submit-encrypted-message.dto";

const MAX_CIPHERTEXT_BYTES = 1_048_576;
const MAX_ENCRYPTED_HEADER_BYTES = 65_536;
const MAX_TOTAL_CIPHERTEXT_BYTES = 8 * 1_048_576;
const MAX_TOTAL_HEADER_BYTES = 1_048_576;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const MAX_QUEUED_MESSAGE_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

type DecodedEnvelope = {
  recipientDeviceID: string;
  envelopeType: string;
  ciphertext: Buffer;
  encryptedHeader: Buffer;
};

type RealtimeDelivery = {
  recipientUserID: string;
  recipientDeviceUuid: string;
  item: EncryptedInboxItem;
};

type StoredSubmission = {
  receipt: EncryptedMessageReceipt;
  deliveries: RealtimeDelivery[];
};

export type EncryptedMessageReceipt = {
  messageID: string;
  chatID: string;
  senderDeviceID: string;
  serverReceivedAt: Date;
  membershipEpoch: number;
  envelopeCount: number;
  idempotent: boolean;
};

export type EncryptedInboxItem = {
  envelopeID: string;
  messageID: string;
  chatID: string;
  senderUserID: string;
  senderDeviceID: string;
  protocolVersion: string;
  messageType: EncryptedMessageType;
  targetMessageID: string | null;
  clientTimestamp: Date;
  serverReceivedAt: Date;
  membershipEpoch: number;
  envelopeType: string;
  ciphertext: string;
  encryptedHeader: string;
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
};

export function assertExactEnvelopeCoverage(
  expectedDeviceIDs: readonly string[],
  submittedDeviceIDs: readonly string[],
): void {
  const expected = new Set(expectedDeviceIDs);
  const submitted = new Set(submittedDeviceIDs);
  if (submitted.size !== submittedDeviceIDs.length) {
    throw new BadRequestException(
      "Each recipient device must have exactly one envelope",
    );
  }
  if (
    expected.size !== submitted.size ||
    [...expected].some((deviceID) => !submitted.has(deviceID))
  ) {
    throw new BadRequestException(
      "Envelope recipients must exactly match active participant devices",
    );
  }
}

@Injectable()
export class EncryptedMessagesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly devicesService: DevicesService,
    @InjectRepository(EncryptedMessageEntity)
    private readonly messagesRepository: Repository<EncryptedMessageEntity>,
    @InjectRepository(EncryptedMessageEnvelopeEntity)
    private readonly envelopesRepository: Repository<EncryptedMessageEnvelopeEntity>,
    private readonly rateLimitService: AuthRateLimitService,
    private readonly securityAuditService: SecurityAuditService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async submit(
    user: AuthenticatedUser,
    dto: SubmitEncryptedMessageDto,
  ): Promise<EncryptedMessageReceipt> {
    this.consumeRateLimit(user, "submit", 120);
    const clientTimestamp = this.parseClientTimestamp(dto.clientTimestamp);
    const decodedEnvelopes = this.decodeEnvelopes(dto.envelopes);
    await this.devicesService.requireCurrentDevice(user);

    let submission: StoredSubmission;
    try {
      submission = await this.dataSource.transaction(async (manager) => {
        const devices = manager.getRepository(UserDeviceEntity);
        const senderDevice = await devices.findOne({
          where: {
            id: dto.senderDeviceID,
            userId: user.sub,
            deviceUuid: user.deviceUuid,
            revokedAt: IsNull(),
          },
          lock: { mode: "pessimistic_read" },
        });
        if (!senderDevice) {
          throw new ForbiddenException(
            "Sender device is not active or does not belong to this session",
          );
        }

        const chats = manager.getRepository(ChatEntity);
        const chat = await chats.findOne({
          where: { id: dto.chatID },
          lock: { mode: "pessimistic_read" },
        });
        if (!chat) {
          throw new NotFoundException("Chat not found");
        }

        const participants = await manager
          .getRepository(ChatParticipantEntity)
          .find({
            where: { chatId: chat.id },
            order: { joinedAt: "ASC" },
          });
        if (
          !participants.some((participant) => participant.userId === user.sub)
        ) {
          throw new ForbiddenException("You are not a chat participant");
        }
        if (chat.encryptionEpoch !== dto.membershipEpoch) {
          throw new ConflictException("Membership encryption epoch is stale");
        }
        const otherParticipantUserIDs = participants
          .map((participant) => participant.userId)
          .filter((userID) => userID !== user.sub);
        if (
          otherParticipantUserIDs.length > 0 &&
          (await manager.getRepository(ContactRequestEntity).findOne({
            where: [
              {
                requesterUserId: user.sub,
                recipientUserId: In(otherParticipantUserIDs),
                status: ContactRequestStatus.BLOCKED,
              },
              {
                requesterUserId: In(otherParticipantUserIDs),
                recipientUserId: user.sub,
                status: ContactRequestStatus.BLOCKED,
              },
            ],
            select: { id: true },
            lock: { mode: "pessimistic_read" },
          }))
        ) {
          throw new ForbiddenException(
            "A blocked relationship prevents encrypted delivery",
          );
        }

        const messages = manager.getRepository(EncryptedMessageEntity);
        const existing = await messages.findOne({
          where: {
            chatId: chat.id,
            senderDeviceId: senderDevice.id,
            idempotencyKey: dto.idempotencyKey,
          },
          relations: { envelopes: true },
        });
        if (existing) {
          this.assertIdempotentPayload(
            existing,
            dto,
            clientTimestamp,
            decodedEnvelopes,
          );
          return {
            receipt: this.mapReceipt(existing, true),
            deliveries: [],
          };
        }

        await this.validateTargetMessage(manager, user.sub, dto);
        const participantUserIDs = participants.map(
          (participant) => participant.userId,
        );
        const activeDevices = await devices.find({
          where: {
            userId: In(participantUserIDs),
            revokedAt: IsNull(),
          },
          order: { createdAt: "ASC" },
        });
        const usersWithDevices = new Set(
          activeDevices.map((device) => device.userId),
        );
        if (
          participantUserIDs.some((userID) => !usersWithDevices.has(userID))
        ) {
          throw new ConflictException(
            "Every chat participant must register an active device",
          );
        }
        assertExactEnvelopeCoverage(
          activeDevices.map((device) => device.id),
          decodedEnvelopes.map((envelope) => envelope.recipientDeviceID),
        );
        const deviceByID = new Map(
          activeDevices.map((device) => [device.id, device]),
        );

        const now = new Date();
        const message = messages.create({
          chatId: chat.id,
          senderUserId: user.sub,
          senderDeviceId: senderDevice.id,
          protocolVersion: dto.protocolVersion,
          messageType: dto.messageType,
          targetMessageId: dto.targetMessageID ?? null,
          clientTimestamp,
          serverReceivedAt: now,
          idempotencyKey: dto.idempotencyKey,
          membershipEpoch: dto.membershipEpoch,
          ciphertextSize: Math.max(
            ...decodedEnvelopes.map((envelope) => envelope.ciphertext.length),
          ),
        });
        const savedMessage = await messages.save(message);

        const envelopes = manager.getRepository(EncryptedMessageEnvelopeEntity);
        const savedEnvelopes = await envelopes.save(
          decodedEnvelopes.map((envelope) => {
            const recipientDevice = deviceByID.get(envelope.recipientDeviceID);
            if (!recipientDevice) {
              throw new BadRequestException(
                "Envelope recipient device is not active",
              );
            }
            return envelopes.create({
              messageId: savedMessage.id,
              recipientUserId: recipientDevice.userId,
              recipientDeviceId: recipientDevice.id,
              envelopeType: envelope.envelopeType,
              ciphertext: envelope.ciphertext,
              encryptedHeader: envelope.encryptedHeader,
              deliveredAt: null,
              readAt: null,
              createdAt: now,
            });
          }),
        );

        chat.lastActivity = now;
        await chats.save(chat);
        savedMessage.envelopes = savedEnvelopes;
        const deliveries = savedEnvelopes.map((envelope) => {
          const recipientDevice = deviceByID.get(envelope.recipientDeviceId);
          if (!recipientDevice) {
            throw new BadRequestException(
              "Envelope recipient device is not active",
            );
          }
          envelope.message = savedMessage;
          return {
            recipientUserID: envelope.recipientUserId,
            recipientDeviceUuid: recipientDevice.deviceUuid,
            item: this.mapInboxItem(envelope),
          };
        });
        return {
          receipt: this.mapReceipt(savedMessage, false),
          deliveries,
        };
      });
    } catch (error) {
      if (!this.isIdempotencyUniqueViolation(error)) {
        await this.recordAudit(
          user,
          "e2ee.message.submitted",
          error instanceof ForbiddenException
            ? SecurityAuditOutcome.DENIED
            : SecurityAuditOutcome.FAILURE,
          {
            chatId: dto.chatID,
            senderDeviceId: dto.senderDeviceID,
            envelopeCount: dto.envelopes.length,
            statusCode:
              error instanceof HttpException ? error.getStatus() : 500,
          },
        );
        throw error;
      }
      const existing = await this.messagesRepository.findOne({
        where: {
          chatId: dto.chatID,
          senderDeviceId: dto.senderDeviceID,
          idempotencyKey: dto.idempotencyKey,
          senderUserId: user.sub,
        },
        relations: { envelopes: true },
      });
      if (!existing) {
        throw new ConflictException("Duplicate encrypted message");
      }
      this.assertIdempotentPayload(
        existing,
        dto,
        clientTimestamp,
        decodedEnvelopes,
      );
      submission = {
        receipt: this.mapReceipt(existing, true),
        deliveries: [],
      };
    }
    let realtimeDeliveryFailures = 0;
    for (const delivery of submission.deliveries) {
      try {
        this.realtimeService.sendToDevice(
          delivery.recipientUserID,
          delivery.recipientDeviceUuid,
          {
            event: "encrypted-message.created",
            data: delivery.item,
          },
        );
      } catch {
        realtimeDeliveryFailures += 1;
      }
    }
    await this.recordAudit(
      user,
      "e2ee.message.submitted",
      SecurityAuditOutcome.SUCCESS,
      {
        messageId: submission.receipt.messageID,
        chatId: submission.receipt.chatID,
        senderDeviceId: submission.receipt.senderDeviceID,
        envelopeCount: submission.receipt.envelopeCount,
        idempotent: submission.receipt.idempotent,
        realtimeDeliveryFailures,
      },
    );
    return submission.receipt;
  }

  async getInbox(
    user: AuthenticatedUser,
    query: EncryptedInboxQueryDto,
  ): Promise<EncryptedInboxItem[]> {
    this.consumeRateLimit(user, "inbox", 300);
    if (Boolean(query.after) !== Boolean(query.afterEnvelopeID)) {
      throw new BadRequestException(
        "after and afterEnvelopeID must be supplied together",
      );
    }
    const device = await this.devicesService.requireCurrentDevice(user);
    const builder = this.envelopesRepository
      .createQueryBuilder("envelope")
      .innerJoinAndSelect("envelope.message", "message")
      .where("envelope.recipientUserId = :userID", { userID: user.sub })
      .andWhere("envelope.recipientDeviceId = :deviceID", {
        deviceID: device.id,
      });

    if (query.after && query.afterEnvelopeID) {
      const after = new Date(query.after);
      if (!Number.isFinite(after.getTime())) {
        throw new BadRequestException("Invalid inbox cursor timestamp");
      }
      builder.andWhere(
        "(envelope.createdAt > :after OR (envelope.createdAt = :after AND envelope.id > :afterEnvelopeID))",
        {
          after,
          afterEnvelopeID: query.afterEnvelopeID,
        },
      );
    }

    const envelopes = await builder
      .orderBy("envelope.createdAt", "ASC")
      .addOrderBy("envelope.id", "ASC")
      .take(query.limit)
      .getMany();
    const response = envelopes.map((envelope) => this.mapInboxItem(envelope));
    await this.recordAudit(
      user,
      "e2ee.message.inbox_read",
      SecurityAuditOutcome.SUCCESS,
      {
        deviceId: device.id,
        envelopeCount: response.length,
      },
    );
    return response;
  }

  async markDelivered(
    user: AuthenticatedUser,
    envelopeID: string,
  ): Promise<{
    envelopeID: string;
    deliveredAt: Date;
    readAt: Date | null;
  }> {
    return this.recordReceipt(user, envelopeID, false);
  }

  async markRead(
    user: AuthenticatedUser,
    envelopeID: string,
  ): Promise<{
    envelopeID: string;
    deliveredAt: Date;
    readAt: Date | null;
  }> {
    return this.recordReceipt(user, envelopeID, true);
  }

  private async recordReceipt(
    user: AuthenticatedUser,
    envelopeID: string,
    markRead: boolean,
  ): Promise<{
    envelopeID: string;
    deliveredAt: Date;
    readAt: Date | null;
  }> {
    this.consumeRateLimit(
      user,
      markRead ? "receipt.read" : "receipt.delivered",
      600,
    );
    const device = await this.devicesService.requireCurrentDevice(user);
    const response = await this.dataSource.transaction(async (manager) => {
      const envelopes = manager.getRepository(EncryptedMessageEnvelopeEntity);
      const envelope = await envelopes.findOne({
        where: {
          id: envelopeID,
          recipientUserId: user.sub,
          recipientDeviceId: device.id,
        },
        lock: { mode: "pessimistic_write" },
      });
      if (!envelope) {
        throw new NotFoundException("Encrypted message envelope not found");
      }

      const now = new Date();
      envelope.deliveredAt ??= now;
      if (markRead) {
        envelope.readAt ??= now;
      }
      await envelopes.save(envelope);
      return {
        envelopeID: envelope.id,
        deliveredAt: envelope.deliveredAt,
        readAt: envelope.readAt,
      };
    });
    await this.recordAudit(
      user,
      markRead ? "e2ee.message.marked_read" : "e2ee.message.marked_delivered",
      SecurityAuditOutcome.SUCCESS,
      {
        envelopeId: envelopeID,
        deviceId: device.id,
      },
    );
    return response;
  }

  private async validateTargetMessage(
    manager: EntityManager,
    senderUserID: string,
    dto: SubmitEncryptedMessageDto,
  ): Promise<void> {
    const requiresTarget = [
      EncryptedMessageType.EDIT,
      EncryptedMessageType.DELETE,
      EncryptedMessageType.REACTION,
    ].includes(dto.messageType);
    const allowsOptionalReplyTarget = [
      EncryptedMessageType.TEXT,
      EncryptedMessageType.ATTACHMENT,
      EncryptedMessageType.LOCATION,
    ].includes(dto.messageType);
    if (dto.messageType === EncryptedMessageType.SYSTEM) {
      throw new ForbiddenException(
        "Client devices cannot create system messages",
      );
    }
    if (requiresTarget && !dto.targetMessageID) {
      throw new BadRequestException(
        "This encrypted message type requires targetMessageID",
      );
    }
    if (dto.targetMessageID && !requiresTarget && !allowsOptionalReplyTarget) {
      throw new BadRequestException(
        "targetMessageID is not valid for this encrypted message type",
      );
    }
    if (!dto.targetMessageID) {
      return;
    }

    const target = await manager
      .getRepository(EncryptedMessageEntity)
      .findOneBy({
        id: dto.targetMessageID,
        chatId: dto.chatID,
      });
    if (!target) {
      throw new BadRequestException(
        "Target encrypted message is not in this chat",
      );
    }
    if (
      [EncryptedMessageType.EDIT, EncryptedMessageType.DELETE].includes(
        dto.messageType,
      ) &&
      target.senderUserId !== senderUserID
    ) {
      throw new ForbiddenException(
        "Only the original sender can edit or delete a message",
      );
    }
  }

  private decodeEnvelopes(
    envelopes: readonly EncryptedEnvelopeDto[],
  ): DecodedEnvelope[] {
    let totalCiphertextBytes = 0;
    let totalHeaderBytes = 0;
    const recipientDeviceIDs = new Set<string>();
    const decoded = envelopes.map((envelope, index) => {
      if (recipientDeviceIDs.has(envelope.recipientDeviceID)) {
        throw new BadRequestException(
          "Each recipient device must have exactly one envelope",
        );
      }
      recipientDeviceIDs.add(envelope.recipientDeviceID);
      const ciphertext = decodeStrictBase64(
        envelope.ciphertext,
        `envelopes[${index}].ciphertext`,
        1,
        MAX_CIPHERTEXT_BYTES,
      );
      const encryptedHeader = decodeStrictBase64(
        envelope.encryptedHeader,
        `envelopes[${index}].encryptedHeader`,
        1,
        MAX_ENCRYPTED_HEADER_BYTES,
      );
      totalCiphertextBytes += ciphertext.length;
      totalHeaderBytes += encryptedHeader.length;
      return {
        recipientDeviceID: envelope.recipientDeviceID,
        envelopeType: envelope.envelopeType,
        ciphertext,
        encryptedHeader,
      };
    });
    if (totalCiphertextBytes > MAX_TOTAL_CIPHERTEXT_BYTES) {
      throw new BadRequestException(
        "Encrypted message payload exceeds the total ciphertext limit",
      );
    }
    if (totalHeaderBytes > MAX_TOTAL_HEADER_BYTES) {
      throw new BadRequestException(
        "Encrypted message payload exceeds the total header limit",
      );
    }
    return decoded;
  }

  private parseClientTimestamp(value: string): Date {
    const timestamp = new Date(value);
    const time = timestamp.getTime();
    const now = Date.now();
    if (!Number.isFinite(time)) {
      throw new BadRequestException("Invalid clientTimestamp");
    }
    if (time > now + MAX_FUTURE_CLOCK_SKEW_MS) {
      throw new BadRequestException("clientTimestamp is too far in the future");
    }
    if (time < now - MAX_QUEUED_MESSAGE_AGE_MS) {
      throw new BadRequestException("clientTimestamp is too old");
    }
    return timestamp;
  }

  private assertIdempotentPayload(
    existing: EncryptedMessageEntity,
    dto: SubmitEncryptedMessageDto,
    clientTimestamp: Date,
    submittedEnvelopes: readonly DecodedEnvelope[],
  ): void {
    const storedEnvelopes = existing.envelopes ?? [];
    const storedByDevice = new Map(
      storedEnvelopes.map((envelope) => [envelope.recipientDeviceId, envelope]),
    );
    const payloadMatches =
      existing.chatId === dto.chatID &&
      existing.senderDeviceId === dto.senderDeviceID &&
      existing.protocolVersion === dto.protocolVersion &&
      existing.messageType === dto.messageType &&
      existing.targetMessageId === (dto.targetMessageID ?? null) &&
      existing.clientTimestamp.getTime() === clientTimestamp.getTime() &&
      existing.membershipEpoch === dto.membershipEpoch &&
      storedEnvelopes.length === submittedEnvelopes.length &&
      submittedEnvelopes.every((submitted) => {
        const stored = storedByDevice.get(submitted.recipientDeviceID);
        return (
          stored !== undefined &&
          stored.envelopeType === submitted.envelopeType &&
          stored.ciphertext.equals(submitted.ciphertext) &&
          stored.encryptedHeader.equals(submitted.encryptedHeader)
        );
      });
    if (!payloadMatches) {
      throw new ConflictException(
        "The idempotency key was already used for another payload",
      );
    }
  }

  private mapReceipt(
    message: EncryptedMessageEntity,
    idempotent: boolean,
  ): EncryptedMessageReceipt {
    return {
      messageID: message.id,
      chatID: message.chatId,
      senderDeviceID: message.senderDeviceId,
      serverReceivedAt: message.serverReceivedAt,
      membershipEpoch: message.membershipEpoch,
      envelopeCount: message.envelopes?.length ?? 0,
      idempotent,
    };
  }

  private mapInboxItem(
    envelope: EncryptedMessageEnvelopeEntity,
  ): EncryptedInboxItem {
    const message = envelope.message;
    return {
      envelopeID: envelope.id,
      messageID: message.id,
      chatID: message.chatId,
      senderUserID: message.senderUserId,
      senderDeviceID: message.senderDeviceId,
      protocolVersion: message.protocolVersion,
      messageType: message.messageType,
      targetMessageID: message.targetMessageId,
      clientTimestamp: message.clientTimestamp,
      serverReceivedAt: message.serverReceivedAt,
      membershipEpoch: message.membershipEpoch,
      envelopeType: envelope.envelopeType,
      ciphertext: envelope.ciphertext.toString("base64"),
      encryptedHeader: envelope.encryptedHeader.toString("base64"),
      deliveredAt: envelope.deliveredAt,
      readAt: envelope.readAt,
      createdAt: envelope.createdAt,
    };
  }

  private isIdempotencyUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError as {
      code?: string;
      constraint?: string;
    };
    return (
      driverError.code === "23505" &&
      (driverError.constraint ?? "")
        .toLowerCase()
        .includes("encrypted_messages_idempotency")
    );
  }

  private consumeRateLimit(
    user: AuthenticatedUser,
    action: string,
    maxRequests: number,
  ): void {
    this.rateLimitService.consume(
      `e2ee:messages:${action}:${user.sub}:${user.deviceUuid}`,
      {
        maxRequests,
        windowMs: 60 * 1_000,
        message: "Too many encrypted messaging requests",
      },
    );
  }

  private recordAudit(
    user: AuthenticatedUser,
    eventType: string,
    outcome: SecurityAuditOutcome,
    metadata: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    return this.securityAuditService.record({
      eventType,
      actorType: SecurityActorType.USER,
      actorId: user.sub,
      outcome,
      metadata: {
        sessionId: user.sid,
        sessionDeviceUuid: user.deviceUuid,
        ...metadata,
      },
    });
  }
}
