import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { DataSource, EntityManager, Repository } from "typeorm";
import { ChatParticipantEntity } from "../src/entities/chat-participant.entity";
import { ChatEntity } from "../src/entities/chat.entity";
import {
  ContactRequestEntity,
  ContactRequestStatus,
} from "../src/entities/contact-request.entity";
import { EncryptedMessageEnvelopeEntity } from "../src/entities/encrypted-message-envelope.entity";
import {
  EncryptedMessageEntity,
  EncryptedMessageType,
} from "../src/entities/encrypted-message.entity";
import { OneTimePreKeyEntity } from "../src/entities/one-time-prekey.entity";
import {
  DevicePlatform,
  UserDeviceEntity,
} from "../src/entities/user-device.entity";
import { AuthMethod } from "../src/entities/user.entity";
import { AuthenticatedUser } from "../src/modules/common/authenticated-user";
import { AuthRateLimitService } from "../src/modules/auth/auth-rate-limit.service";
import { decodeStrictBase64 } from "../src/modules/devices/base64";
import { DevicesService } from "../src/modules/devices/devices.service";
import {
  assertExactEnvelopeCoverage,
  EncryptedMessagesService,
} from "../src/modules/encrypted-messages/encrypted-messages.service";
import { SubmitEncryptedMessageDto } from "../src/modules/encrypted-messages/dto/submit-encrypted-message.dto";
import { SecurityAuditService } from "../src/modules/security/security-audit.service";
import { SessionService } from "../src/modules/sessions/session.service";
import { RealtimeService } from "../src/modules/realtime/realtime.service";

const noOpRateLimitService = {
  consume: () => undefined,
} as unknown as AuthRateLimitService;

const noOpAuditService = {
  record: async () => undefined,
} as unknown as SecurityAuditService;

const noOpSessionService = {
  revokeSessionsForDevice: async () => 0,
} as unknown as SessionService;

function authenticatedUser(
  userID: string,
  deviceUuid: string,
): AuthenticatedUser {
  return {
    sub: userID,
    sid: randomUUID(),
    jti: randomUUID(),
    role: "user",
    sessionVersion: 1,
    deviceUuid,
    login: "test-user",
    displayName: "Test User",
    contact: "+15550000000",
    method: AuthMethod.PHONE,
    phone: "+15550000000",
  };
}

function device(
  userID: string,
  deviceUuid: string,
  id = randomUUID(),
): UserDeviceEntity {
  return Object.assign(new UserDeviceEntity(), {
    id,
    userId: userID,
    deviceUuid,
    deviceName: "Test Device",
    platform: DevicePlatform.IOS,
    identityPublicKey: Buffer.alloc(32, 1),
    signedPreKey: Buffer.alloc(32, 2),
    signedPreKeyId: 1,
    signedPreKeySignature: Buffer.alloc(64, 3),
    registrationId: 10,
    keyVersion: 1,
    identityChangedAt: null,
    lastSeenAt: new Date(),
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

test("strict base64 rejects non-canonical encodings and decoded size violations", () => {
  const valid = Buffer.alloc(32, 7).toString("base64");
  assert.deepEqual(
    decodeStrictBase64(valid, "key", 32, 64),
    Buffer.alloc(32, 7),
  );

  assert.throws(
    () => decodeStrictBase64(`${valid}\n`, "key", 32, 64),
    BadRequestException,
  );
  assert.throws(
    () => decodeStrictBase64(valid.replace(/=$/, ""), "key", 32, 64),
    BadRequestException,
  );
  assert.throws(
    () =>
      decodeStrictBase64(Buffer.alloc(31, 7).toString("base64"), "key", 32, 64),
    BadRequestException,
  );
});

test("recipient coverage rejects missing, extra, and duplicate envelopes", () => {
  const first = randomUUID();
  const second = randomUUID();

  assert.doesNotThrow(() =>
    assertExactEnvelopeCoverage([first, second], [second, first]),
  );
  assert.throws(
    () => assertExactEnvelopeCoverage([first, second], [first]),
    BadRequestException,
  );
  assert.throws(
    () => assertExactEnvelopeCoverage([first], [first, second]),
    BadRequestException,
  );
  assert.throws(
    () => assertExactEnvelopeCoverage([first, second], [first, first]),
    BadRequestException,
  );
});

test("key bundle claims use an atomic single-use SQL transition", async () => {
  const requesterUserID = randomUUID();
  const targetUserID = randomUUID();
  const requester = device(requesterUserID, "ios-requester-0001");
  const target = device(targetUserID, "ios-target-000001");
  const availablePreKeys = [
    { keyId: 7, publicKey: Buffer.alloc(32, 7) },
    { keyId: 8, publicKey: Buffer.alloc(32, 8) },
  ];
  const executedSQL: string[] = [];

  const devicesRepository = {
    findOne: async () => requester,
    find: async () => [target],
  };
  const contactsRepository = {
    findOne: async () =>
      Object.assign(new ContactRequestEntity(), {
        id: randomUUID(),
        status: ContactRequestStatus.ACCEPTED,
      }),
  };
  const participantsRepository = {
    find: async () => [],
    exists: async () => false,
  };
  const manager = {
    getRepository: (entity: object) => {
      if (entity === UserDeviceEntity) {
        return devicesRepository;
      }
      if (entity === ContactRequestEntity) {
        return contactsRepository;
      }
      if (entity === ChatParticipantEntity) {
        return participantsRepository;
      }
      throw new Error("Unexpected repository");
    },
    query: async (sql: string) => {
      executedSQL.push(sql);
      const claimed = availablePreKeys.shift();
      return claimed ? [claimed] : [];
    },
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async (
      work: (transactionManager: EntityManager) => Promise<unknown>,
    ) => work(manager),
  } as unknown as DataSource;
  const service = new DevicesService(
    dataSource,
    {} as Repository<UserDeviceEntity>,
    {} as Repository<OneTimePreKeyEntity>,
    noOpRateLimitService,
    noOpAuditService,
    noOpSessionService,
  );
  const user = authenticatedUser(requesterUserID, requester.deviceUuid);

  const first = await service.claimPublicKeyBundles(user, targetUserID);
  const second = await service.claimPublicKeyBundles(user, targetUserID);
  const exhausted = await service.claimPublicKeyBundles(user, targetUserID);

  assert.equal(first.devices[0]?.oneTimePreKey?.keyId, 7);
  assert.equal(second.devices[0]?.oneTimePreKey?.keyId, 8);
  assert.equal(exhausted.devices[0]?.oneTimePreKey, null);
  assert.equal(executedSQL.length, 3);
  for (const sql of executedSQL) {
    assert.match(sql, /FOR UPDATE SKIP LOCKED/);
    assert.match(sql, /"candidate"\."claimed_at" IS NULL/);
    assert.match(sql, /"claimed_by_device_id" = \$2/);
  }
});

test("a blocked relationship cannot regain key access through a stale chat", async () => {
  const requesterUserID = randomUUID();
  const targetUserID = randomUUID();
  const requester = device(requesterUserID, "ios-blocked-requester");
  const manager = {
    getRepository: (entity: object) => {
      if (entity === UserDeviceEntity) {
        return {
          findOne: async () => requester,
        };
      }
      if (entity === ContactRequestEntity) {
        return {
          findOne: async () =>
            Object.assign(new ContactRequestEntity(), {
              id: randomUUID(),
              status: ContactRequestStatus.BLOCKED,
            }),
        };
      }
      if (entity === ChatParticipantEntity) {
        return {
          find: async () => {
            throw new Error("Blocked users must not reach chat fallback");
          },
        };
      }
      throw new Error("Unexpected repository");
    },
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async (
      work: (transactionManager: EntityManager) => Promise<unknown>,
    ) => work(manager),
  } as unknown as DataSource;
  const service = new DevicesService(
    dataSource,
    {} as Repository<UserDeviceEntity>,
    {} as Repository<OneTimePreKeyEntity>,
    noOpRateLimitService,
    noOpAuditService,
    noOpSessionService,
  );

  await assert.rejects(
    service.claimPublicKeyBundles(
      authenticatedUser(requesterUserID, requester.deviceUuid),
      targetUserID,
    ),
    ForbiddenException,
  );
});

test("identity-key changes are visible and advance chat encryption epochs", async () => {
  const userID = randomUUID();
  const current = device(userID, "ios-identity-change");
  const chatID = randomUUID();
  let preKeysDeletedFor: string | null = null;
  let epochIncrementedFor: string | null = null;
  const auditEvents: string[] = [];
  const manager = {
    getRepository: (entity: object) => {
      if (entity === UserDeviceEntity) {
        return {
          findOne: async () => current,
          save: async (value: UserDeviceEntity) => value,
        };
      }
      if (entity === OneTimePreKeyEntity) {
        return {
          delete: async (where: { deviceId: string }) => {
            preKeysDeletedFor = where.deviceId;
            return { affected: 2 };
          },
        };
      }
      if (entity === ChatParticipantEntity) {
        return {
          find: async () => [{ chatId: chatID }],
        };
      }
      if (entity === ChatEntity) {
        return {
          increment: async (where: { id: { value: string[] } }) => {
            epochIncrementedFor = where.id.value[0] ?? null;
            return { affected: 1 };
          },
        };
      }
      throw new Error("Unexpected repository");
    },
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async (
      work: (transactionManager: EntityManager) => Promise<unknown>,
    ) => work(manager),
  } as unknown as DataSource;
  const auditService = {
    record: async (input: { eventType: string }) => {
      auditEvents.push(input.eventType);
    },
  } as unknown as SecurityAuditService;
  const service = new DevicesService(
    dataSource,
    {} as Repository<UserDeviceEntity>,
    {} as Repository<OneTimePreKeyEntity>,
    noOpRateLimitService,
    auditService,
    noOpSessionService,
  );

  const result = await service.registerOrUpdateCurrentDevice(
    authenticatedUser(userID, current.deviceUuid),
    {
      deviceName: current.deviceName,
      platform: DevicePlatform.IOS,
      identityPublicKey: Buffer.alloc(32, 9).toString("base64"),
      signedPreKey: Buffer.alloc(32, 10).toString("base64"),
      signedPreKeyId: 2,
      signedPreKeySignature: Buffer.alloc(64, 11).toString("base64"),
      registrationId: 11,
    },
  );

  assert.equal(result.identityChanged, true);
  assert.equal(result.keyVersion, 2);
  assert.ok(result.identityChangedAt instanceof Date);
  assert.equal(preKeysDeletedFor, current.id);
  assert.equal(epochIncrementedFor, chatID);
  assert.deepEqual(auditEvents, ["e2ee.device.identity_changed"]);
});

test("revoking a device also revokes its authenticated sessions", async () => {
  const userID = randomUUID();
  const revokedDevice = device(userID, "ios-revoked-device");
  const user = authenticatedUser(userID, "ios-current-device");
  let revokedSessionDeviceUuid: string | null = null;
  const manager = {
    getRepository: (entity: object) => {
      if (entity === UserDeviceEntity) {
        return {
          findOne: async () => revokedDevice,
          save: async (value: UserDeviceEntity) => value,
        };
      }
      if (entity === OneTimePreKeyEntity) {
        return {
          delete: async () => ({ affected: 10 }),
        };
      }
      if (entity === ChatParticipantEntity) {
        return {
          find: async () => [],
        };
      }
      throw new Error("Unexpected repository");
    },
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async (
      work: (transactionManager: EntityManager) => Promise<unknown>,
    ) => work(manager),
  } as unknown as DataSource;
  const sessionService = {
    revokeSessionsForDevice: async (
      _principalType: string,
      _principalId: string,
      deviceUuid: string,
    ) => {
      revokedSessionDeviceUuid = deviceUuid;
      return 1;
    },
  } as unknown as SessionService;
  const service = new DevicesService(
    dataSource,
    {} as Repository<UserDeviceEntity>,
    {} as Repository<OneTimePreKeyEntity>,
    noOpRateLimitService,
    noOpAuditService,
    sessionService,
  );

  const result = await service.revokeDevice(user, revokedDevice.id);

  assert.equal(result.ok, true);
  assert.ok(result.revokedAt instanceof Date);
  assert.equal(revokedDevice.revokedAt, result.revokedAt);
  assert.equal(revokedSessionDeviceUuid, revokedDevice.deviceUuid);
});

test("encrypted submission stores only opaque envelopes and is idempotent", async () => {
  const senderUserID = randomUUID();
  const recipientUserID = randomUUID();
  const sender = device(senderUserID, "ios-sender-000001");
  const recipient = device(recipientUserID, "ios-recipient-001");
  const revokedRecipient = device(recipientUserID, "ios-recipient-old");
  revokedRecipient.revokedAt = new Date();
  const user = authenticatedUser(senderUserID, sender.deviceUuid);
  const chat = Object.assign(new ChatEntity(), {
    id: randomUUID(),
    title: "Encrypted chat",
    lastMessageId: null,
    lastActivity: new Date(),
    encryptionEpoch: 3,
    e2eeRequired: true,
    createdAt: new Date(),
  });
  const participants = [senderUserID, recipientUserID].map((userId) =>
    Object.assign(new ChatParticipantEntity(), {
      id: randomUUID(),
      chatId: chat.id,
      userId,
      lastReadMessageId: null,
      lastReadAt: null,
      hiddenAt: null,
      joinedAt: new Date(),
    }),
  );
  let storedMessage: EncryptedMessageEntity | null = null;
  let messageRelationshipBlocked = false;
  const storedEnvelopes: EncryptedMessageEnvelopeEntity[] = [];
  const realtimeDeliveries: Array<{
    userID: string;
    deviceUuid: string;
    event: string;
    ciphertext: string;
  }> = [];

  const messageRepository = {
    findOne: async (options: {
      where: { idempotencyKey: string };
    }): Promise<EncryptedMessageEntity | null> =>
      storedMessage?.idempotencyKey === options.where.idempotencyKey
        ? storedMessage
        : null,
    create: (value: Partial<EncryptedMessageEntity>) =>
      Object.assign(new EncryptedMessageEntity(), value),
    save: async (value: EncryptedMessageEntity) => {
      storedMessage = value;
      return value;
    },
  };
  const envelopeRepository = {
    create: (value: Partial<EncryptedMessageEnvelopeEntity>) =>
      Object.assign(new EncryptedMessageEnvelopeEntity(), value),
    save: async (values: EncryptedMessageEnvelopeEntity[]) => {
      for (const value of values) {
        value.createdAt = new Date();
        storedEnvelopes.push(value);
      }
      return values;
    },
  };
  const manager = {
    getRepository: (entity: object) => {
      if (entity === UserDeviceEntity) {
        return {
          findOne: async () => sender,
          find: async () => [sender, recipient],
        };
      }
      if (entity === ChatEntity) {
        return {
          findOne: async () => chat,
          save: async (value: ChatEntity) => value,
        };
      }
      if (entity === ChatParticipantEntity) {
        return { find: async () => participants };
      }
      if (entity === ContactRequestEntity) {
        return {
          findOne: async () =>
            messageRelationshipBlocked
              ? Object.assign(new ContactRequestEntity(), {
                  id: randomUUID(),
                  status: ContactRequestStatus.BLOCKED,
                })
              : null,
        };
      }
      if (entity === EncryptedMessageEntity) {
        return messageRepository;
      }
      if (entity === EncryptedMessageEnvelopeEntity) {
        return envelopeRepository;
      }
      throw new Error("Unexpected repository");
    },
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async (
      work: (transactionManager: EntityManager) => Promise<unknown>,
    ) => work(manager),
  } as unknown as DataSource;
  const devicesService = {
    requireCurrentDevice: async () => sender,
  } as unknown as DevicesService;
  const realtimeService = {
    sendToDevice: (
      userID: string,
      deviceUuid: string,
      envelope: {
        event: string;
        data: { ciphertext: string };
      },
    ) => {
      realtimeDeliveries.push({
        userID,
        deviceUuid,
        event: envelope.event,
        ciphertext: envelope.data.ciphertext,
      });
    },
  } as unknown as RealtimeService;
  const service = new EncryptedMessagesService(
    dataSource,
    devicesService,
    messageRepository as unknown as Repository<EncryptedMessageEntity>,
    {} as Repository<EncryptedMessageEnvelopeEntity>,
    noOpRateLimitService,
    noOpAuditService,
    realtimeService,
  );
  const dto: SubmitEncryptedMessageDto = {
    chatID: chat.id,
    senderDeviceID: sender.id,
    protocolVersion: "opaque-v1",
    messageType: EncryptedMessageType.TEXT,
    clientTimestamp: new Date().toISOString(),
    idempotencyKey: randomUUID(),
    membershipEpoch: 3,
    envelopes: [sender, recipient].map((target, index) => ({
      recipientDeviceID: target.id,
      envelopeType: "message",
      ciphertext: Buffer.from(`ciphertext-${index}`).toString("base64"),
      encryptedHeader: Buffer.from(`header-${index}`).toString("base64"),
    })),
  };

  const first = await service.submit(user, dto);
  const repeated = await service.submit(user, dto);

  assert.equal(first.envelopeCount, 2);
  assert.equal(first.idempotent, false);
  assert.equal(repeated.messageID, first.messageID);
  assert.equal(repeated.idempotent, true);
  assert.deepEqual(
    realtimeDeliveries.map((delivery) => [
      delivery.userID,
      delivery.deviceUuid,
      delivery.event,
    ]),
    [
      [sender.userId, sender.deviceUuid, "encrypted-message.created"],
      [recipient.userId, recipient.deviceUuid, "encrypted-message.created"],
    ],
  );
  assert.notEqual(
    realtimeDeliveries[0]?.ciphertext,
    realtimeDeliveries[1]?.ciphertext,
  );
  assert.equal(storedEnvelopes.length, 2);
  assert.ok(Buffer.isBuffer(storedEnvelopes[0]?.ciphertext));
  assert.equal(
    "text" in (storedMessage as unknown as Record<string, unknown>),
    false,
  );
  assert.equal(
    "ciphertext" in (first as unknown as Record<string, unknown>),
    false,
  );

  await assert.rejects(
    service.submit(user, {
      ...dto,
      envelopes: dto.envelopes.map((envelope, index) =>
        index === 0
          ? {
              ...envelope,
              ciphertext: Buffer.from("tampered").toString("base64"),
            }
          : envelope,
      ),
    }),
    ConflictException,
  );
  await assert.rejects(
    service.submit(user, {
      ...dto,
      idempotencyKey: randomUUID(),
      envelopes: [dto.envelopes[0]!],
    }),
    BadRequestException,
  );
  await assert.rejects(
    service.submit(user, {
      ...dto,
      idempotencyKey: randomUUID(),
      envelopes: [
        ...dto.envelopes,
        {
          recipientDeviceID: revokedRecipient.id,
          envelopeType: "message",
          ciphertext: Buffer.from("revoked-ciphertext").toString("base64"),
          encryptedHeader: Buffer.from("revoked-header").toString("base64"),
        },
      ],
    }),
    BadRequestException,
  );
  await assert.rejects(
    service.submit(user, {
      ...dto,
      idempotencyKey: randomUUID(),
      membershipEpoch: 2,
    }),
    ConflictException,
  );
  messageRelationshipBlocked = true;
  await assert.rejects(
    service.submit(user, {
      ...dto,
      idempotencyKey: randomUUID(),
    }),
    ForbiddenException,
  );
});
