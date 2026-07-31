import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, IsNull, Repository } from "typeorm";
import { ChatParticipantEntity } from "../../entities/chat-participant.entity";
import { ChatEntity } from "../../entities/chat.entity";
import { SessionPrincipalType } from "../../entities/auth-session.entity";
import {
  ContactRequestEntity,
  ContactRequestStatus,
} from "../../entities/contact-request.entity";
import { OneTimePreKeyEntity } from "../../entities/one-time-prekey.entity";
import {
  SecurityActorType,
  SecurityAuditOutcome,
} from "../../entities/security-audit-event.entity";
import { UserDeviceEntity } from "../../entities/user-device.entity";
import { AuthRateLimitService } from "../auth/auth-rate-limit.service";
import { AuthenticatedUser } from "../common/authenticated-user";
import { SecurityAuditService } from "../security/security-audit.service";
import { SessionService } from "../sessions/session.service";
import { decodeStrictBase64 } from "./base64";
import { RegisterDeviceDto } from "./dto/register-device.dto";
import { UploadPreKeysDto } from "./dto/upload-prekeys.dto";

const MIN_KEY_BYTES = 32;
const MAX_KEY_BYTES = 4_096;
const MAX_AVAILABLE_PREKEYS = 1_000;

export type DeviceProfile = {
  id: string;
  deviceUuid: string;
  deviceName: string;
  platform: string;
  keyVersion: number;
  identityChangedAt: Date | null;
  lastSeenAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  current: boolean;
};

export type PublicDeviceKeyBundle = {
  deviceID: string;
  deviceUuid: string;
  deviceName: string;
  platform: string;
  registrationId: number;
  identityPublicKey: string;
  signedPreKey: string;
  signedPreKeyId: number;
  signedPreKeySignature: string;
  keyVersion: number;
  identityChanged: boolean;
  identityChangedAt: Date | null;
  oneTimePreKey: {
    keyId: number;
    publicKey: string;
  } | null;
};

type DecodedDeviceKeys = {
  identityPublicKey: Buffer;
  signedPreKey: Buffer;
  signedPreKeySignature: Buffer;
};

type ClaimedPreKeyRow = {
  keyId: number;
  publicKey: Buffer;
};

@Injectable()
export class DevicesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UserDeviceEntity)
    private readonly devicesRepository: Repository<UserDeviceEntity>,
    @InjectRepository(OneTimePreKeyEntity)
    private readonly preKeysRepository: Repository<OneTimePreKeyEntity>,
    private readonly rateLimitService: AuthRateLimitService,
    private readonly securityAuditService: SecurityAuditService,
    private readonly sessionService: SessionService,
  ) {}

  async registerOrUpdateCurrentDevice(
    user: AuthenticatedUser,
    dto: RegisterDeviceDto,
  ): Promise<
    DeviceProfile & {
      created: boolean;
      identityChanged: boolean;
    }
  > {
    this.consumeRateLimit(user, "register", 20);
    const keys = this.decodeDeviceKeys(dto);
    const result = await this.dataSource.transaction(async (manager) => {
      const devices = manager.getRepository(UserDeviceEntity);
      const preKeys = manager.getRepository(OneTimePreKeyEntity);
      const existing = await devices.findOne({
        where: {
          userId: user.sub,
          deviceUuid: user.deviceUuid,
        },
        lock: { mode: "pessimistic_write" },
      });
      const now = new Date();

      if (!existing) {
        const created = devices.create({
          userId: user.sub,
          deviceUuid: user.deviceUuid,
          deviceName: dto.deviceName,
          platform: dto.platform,
          identityPublicKey: keys.identityPublicKey,
          signedPreKey: keys.signedPreKey,
          signedPreKeyId: dto.signedPreKeyId,
          signedPreKeySignature: keys.signedPreKeySignature,
          registrationId: dto.registrationId,
          keyVersion: 1,
          identityChangedAt: null,
          lastSeenAt: now,
          revokedAt: null,
        });
        return {
          device: await devices.save(created),
          created: true,
          identityChanged: false,
          epochBumpedChats: await this.bumpEncryptionEpochs(manager, user.sub),
        };
      }

      if (existing.revokedAt) {
        throw new ForbiddenException(
          "This device identifier has been revoked; register a new device identifier",
        );
      }

      const identityChanged = !existing.identityPublicKey.equals(
        keys.identityPublicKey,
      );
      if (identityChanged) {
        existing.identityChangedAt = now;
        existing.keyVersion += 1;
        await preKeys.delete({ deviceId: existing.id });
      }

      existing.deviceName = dto.deviceName;
      existing.platform = dto.platform;
      existing.identityPublicKey = keys.identityPublicKey;
      existing.signedPreKey = keys.signedPreKey;
      existing.signedPreKeyId = dto.signedPreKeyId;
      existing.signedPreKeySignature = keys.signedPreKeySignature;
      existing.registrationId = dto.registrationId;
      existing.lastSeenAt = now;

      return {
        device: await devices.save(existing),
        created: false,
        identityChanged,
        epochBumpedChats: identityChanged
          ? await this.bumpEncryptionEpochs(manager, user.sub)
          : 0,
      };
    });

    const response = {
      ...this.mapDevice(result.device, user.deviceUuid),
      created: result.created,
      identityChanged: result.identityChanged,
    };
    await this.recordAudit(
      user,
      result.created
        ? "e2ee.device.registered"
        : result.identityChanged
          ? "e2ee.device.identity_changed"
          : "e2ee.device.keys_updated",
      SecurityAuditOutcome.SUCCESS,
      {
        deviceId: result.device.id,
        keyVersion: result.device.keyVersion,
        identityChanged: result.identityChanged,
        epochBumpedChats: result.epochBumpedChats,
      },
    );
    return response;
  }

  async listOwnDevices(user: AuthenticatedUser): Promise<DeviceProfile[]> {
    this.consumeRateLimit(user, "list", 120);
    const devices = await this.devicesRepository.find({
      where: { userId: user.sub },
      order: { createdAt: "ASC" },
    });
    const response = devices.map((device) =>
      this.mapDevice(device, user.deviceUuid),
    );
    await this.recordAudit(
      user,
      "e2ee.device.listed",
      SecurityAuditOutcome.SUCCESS,
      { deviceCount: response.length },
    );
    return response;
  }

  async revokeDevice(
    user: AuthenticatedUser,
    deviceID: string,
  ): Promise<{ ok: true; revokedAt: Date }> {
    this.consumeRateLimit(user, "revoke", 20);
    const revokedAt = await this.dataSource.transaction(async (manager) => {
      const devices = manager.getRepository(UserDeviceEntity);
      const device = await devices.findOne({
        where: { id: deviceID, userId: user.sub },
        lock: { mode: "pessimistic_write" },
      });
      if (!device) {
        throw new NotFoundException("Device not found");
      }
      if (device.revokedAt) {
        return {
          timestamp: device.revokedAt,
          epochBumpedChats: 0,
          deviceUuid: device.deviceUuid,
        };
      }

      const now = new Date();
      device.revokedAt = now;
      await devices.save(device);
      await manager
        .getRepository(OneTimePreKeyEntity)
        .delete({ deviceId: device.id });
      return {
        timestamp: now,
        epochBumpedChats: await this.bumpEncryptionEpochs(manager, user.sub),
        deviceUuid: device.deviceUuid,
      };
    });
    const revokedSessions = await this.sessionService.revokeSessionsForDevice(
      SessionPrincipalType.USER,
      user.sub,
      revokedAt.deviceUuid,
      "e2ee_device_revoked",
    );

    await this.recordAudit(
      user,
      "e2ee.device.revoked",
      SecurityAuditOutcome.SUCCESS,
      {
        deviceId: deviceID,
        epochBumpedChats: revokedAt.epochBumpedChats,
        revokedSessions,
      },
    );
    return { ok: true, revokedAt: revokedAt.timestamp };
  }

  async uploadCurrentDevicePreKeys(
    user: AuthenticatedUser,
    dto: UploadPreKeysDto,
  ): Promise<{ uploaded: number; available: number }> {
    this.consumeRateLimit(user, "prekeys.upload", 30);
    const decodedByID = new Map<number, Buffer>();
    for (const preKey of dto.preKeys) {
      if (decodedByID.has(preKey.keyId)) {
        throw new BadRequestException(
          `Duplicate one-time prekey id ${preKey.keyId}`,
        );
      }
      decodedByID.set(
        preKey.keyId,
        decodeStrictBase64(
          preKey.publicKey,
          `preKeys[${preKey.keyId}].publicKey`,
          MIN_KEY_BYTES,
          MAX_KEY_BYTES,
        ),
      );
    }

    const response = await this.dataSource.transaction(async (manager) => {
      const device = await this.requireCurrentDeviceWithManager(manager, user);
      const preKeys = manager.getRepository(OneTimePreKeyEntity);
      const keyIDs = [...decodedByID.keys()];
      const existing = await preKeys.find({
        where: {
          deviceId: device.id,
          keyId: In(keyIDs),
        },
        lock: { mode: "pessimistic_write" },
      });
      const existingByID = new Map(
        existing.map((preKey) => [preKey.keyId, preKey]),
      );

      const toCreate: OneTimePreKeyEntity[] = [];
      for (const [keyId, publicKey] of decodedByID) {
        const stored = existingByID.get(keyId);
        if (!stored) {
          toCreate.push(
            preKeys.create({
              deviceId: device.id,
              keyId,
              publicKey,
              claimedAt: null,
              claimedByDeviceId: null,
            }),
          );
          continue;
        }

        if (stored.claimedAt || !stored.publicKey.equals(publicKey)) {
          throw new ConflictException(
            `One-time prekey id ${keyId} cannot be reused`,
          );
        }
      }

      const availableBefore = await preKeys.countBy({
        deviceId: device.id,
        claimedAt: IsNull(),
      });
      if (availableBefore + toCreate.length > MAX_AVAILABLE_PREKEYS) {
        throw new BadRequestException(
          `A device may keep at most ${MAX_AVAILABLE_PREKEYS} available one-time prekeys`,
        );
      }
      if (toCreate.length > 0) {
        await preKeys.save(toCreate);
      }

      device.lastSeenAt = new Date();
      await manager.getRepository(UserDeviceEntity).save(device);
      return {
        uploaded: toCreate.length,
        available: availableBefore + toCreate.length,
      };
    });
    await this.recordAudit(
      user,
      "e2ee.device.prekeys_uploaded",
      SecurityAuditOutcome.SUCCESS,
      {
        uploadedCount: response.uploaded,
        availableCount: response.available,
      },
    );
    return response;
  }

  async getCurrentDevicePreKeyStatus(
    user: AuthenticatedUser,
  ): Promise<{ available: number }> {
    this.consumeRateLimit(user, "prekeys.status", 120);
    const device = await this.requireCurrentDevice(user);
    const response = {
      available: await this.preKeysRepository.countBy({
        deviceId: device.id,
        claimedAt: IsNull(),
      }),
    };
    await this.recordAudit(
      user,
      "e2ee.device.prekeys_status",
      SecurityAuditOutcome.SUCCESS,
      {
        deviceId: device.id,
        availableCount: response.available,
      },
    );
    return response;
  }

  async claimPublicKeyBundles(
    user: AuthenticatedUser,
    targetUserID: string,
  ): Promise<{ userID: string; devices: PublicDeviceKeyBundle[] }> {
    this.consumeRateLimit(user, "key-bundles.global", 120, 60 * 60 * 1_000);
    this.consumeRateLimit(
      user,
      `key-bundles.target.${targetUserID}`,
      20,
      60 * 1_000,
    );
    try {
      const response = await this.dataSource.transaction(async (manager) => {
        const requesterDevice = await this.requireCurrentDeviceWithManager(
          manager,
          user,
        );
        if (
          targetUserID !== user.sub &&
          !(await this.canAccessUserKeys(manager, user.sub, targetUserID))
        ) {
          throw new ForbiddenException("Key bundle access is not permitted");
        }

        const targetDevices = await manager
          .getRepository(UserDeviceEntity)
          .find({
            where: {
              userId: targetUserID,
              revokedAt: IsNull(),
            },
            order: { createdAt: "ASC" },
            lock: { mode: "pessimistic_read" },
          });

        const bundles: PublicDeviceKeyBundle[] = [];
        for (const targetDevice of targetDevices) {
          const claimed = await this.claimNextPreKey(
            manager,
            targetDevice.id,
            requesterDevice.id,
          );
          bundles.push(this.mapPublicBundle(targetDevice, claimed));
        }

        return { userID: targetUserID, devices: bundles };
      });
      await this.recordAudit(
        user,
        "e2ee.device.key_bundles_claimed",
        SecurityAuditOutcome.SUCCESS,
        {
          targetUserId: targetUserID,
          targetDeviceCount: response.devices.length,
          oneTimePreKeyCount: response.devices.filter(
            (device) => device.oneTimePreKey !== null,
          ).length,
        },
      );
      return response;
    } catch (error) {
      await this.recordAudit(
        user,
        "e2ee.device.key_bundles_claimed",
        error instanceof ForbiddenException
          ? SecurityAuditOutcome.DENIED
          : SecurityAuditOutcome.FAILURE,
        { targetUserId: targetUserID },
      );
      throw error;
    }
  }

  async requireCurrentDevice(
    user: AuthenticatedUser,
  ): Promise<UserDeviceEntity> {
    const device = await this.devicesRepository.findOneBy({
      userId: user.sub,
      deviceUuid: user.deviceUuid,
      revokedAt: IsNull(),
    });
    if (!device) {
      throw new ForbiddenException(
        "Register the current device before using encrypted messaging",
      );
    }
    return device;
  }

  private async requireCurrentDeviceWithManager(
    manager: EntityManager,
    user: AuthenticatedUser,
  ): Promise<UserDeviceEntity> {
    const device = await manager.getRepository(UserDeviceEntity).findOne({
      where: {
        userId: user.sub,
        deviceUuid: user.deviceUuid,
        revokedAt: IsNull(),
      },
      lock: { mode: "pessimistic_read" },
    });
    if (!device) {
      throw new ForbiddenException(
        "Register the current device before using encrypted messaging",
      );
    }
    return device;
  }

  private async canAccessUserKeys(
    manager: EntityManager,
    requesterUserID: string,
    targetUserID: string,
  ): Promise<boolean> {
    const contacts = manager.getRepository(ContactRequestEntity);
    const contactRelationship = await contacts.findOne({
      where: [
        {
          requesterUserId: requesterUserID,
          recipientUserId: targetUserID,
        },
        {
          requesterUserId: targetUserID,
          recipientUserId: requesterUserID,
        },
      ],
      select: { id: true, status: true },
      lock: { mode: "pessimistic_read" },
    });
    if (contactRelationship?.status === ContactRequestStatus.BLOCKED) {
      return false;
    }
    if (contactRelationship?.status === ContactRequestStatus.ACCEPTED) {
      return true;
    }

    const participants = manager.getRepository(ChatParticipantEntity);
    const requesterChats = await participants.find({
      where: { userId: requesterUserID },
      select: { chatId: true },
      lock: { mode: "pessimistic_read" },
    });
    const chatIDs = requesterChats.map((participant) => participant.chatId);
    if (chatIDs.length === 0) {
      return false;
    }
    const sharedChat = await participants.findOne({
      where: {
        userId: targetUserID,
        chatId: In(chatIDs),
      },
      select: { id: true },
      lock: { mode: "pessimistic_read" },
    });
    return sharedChat !== null;
  }

  private async claimNextPreKey(
    manager: EntityManager,
    targetDeviceID: string,
    requesterDeviceID: string,
  ): Promise<ClaimedPreKeyRow | null> {
    const rows = (await manager.query(
      `
        UPDATE "one_time_prekeys" AS "candidate"
        SET
          "claimed_at" = CURRENT_TIMESTAMP,
          "claimed_by_device_id" = $2
        WHERE "candidate"."id" = (
          SELECT "available"."id"
          FROM "one_time_prekeys" AS "available"
          WHERE
            "available"."device_id" = $1
            AND "available"."claimed_at" IS NULL
          ORDER BY "available"."key_id" ASC, "available"."id" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        AND "candidate"."claimed_at" IS NULL
        RETURNING
          "candidate"."key_id" AS "keyId",
          "candidate"."public_key" AS "publicKey"
      `,
      [targetDeviceID, requesterDeviceID],
    )) as ClaimedPreKeyRow[];
    return rows[0] ?? null;
  }

  private async bumpEncryptionEpochs(
    manager: EntityManager,
    userID: string,
  ): Promise<number> {
    const memberships = await manager
      .getRepository(ChatParticipantEntity)
      .find({
        where: { userId: userID },
        select: { chatId: true },
        lock: { mode: "pessimistic_read" },
      });
    const chatIDs = memberships.map((membership) => membership.chatId);
    if (chatIDs.length === 0) {
      return 0;
    }
    const result = await manager
      .getRepository(ChatEntity)
      .increment({ id: In(chatIDs) }, "encryptionEpoch", 1);
    return result.affected ?? 0;
  }

  private decodeDeviceKeys(dto: RegisterDeviceDto): DecodedDeviceKeys {
    return {
      identityPublicKey: decodeStrictBase64(
        dto.identityPublicKey,
        "identityPublicKey",
        MIN_KEY_BYTES,
        MAX_KEY_BYTES,
      ),
      signedPreKey: decodeStrictBase64(
        dto.signedPreKey,
        "signedPreKey",
        MIN_KEY_BYTES,
        MAX_KEY_BYTES,
      ),
      signedPreKeySignature: decodeStrictBase64(
        dto.signedPreKeySignature,
        "signedPreKeySignature",
        MIN_KEY_BYTES,
        MAX_KEY_BYTES,
      ),
    };
  }

  private mapDevice(
    device: UserDeviceEntity,
    currentDeviceUuid: string,
  ): DeviceProfile {
    return {
      id: device.id,
      deviceUuid: device.deviceUuid,
      deviceName: device.deviceName,
      platform: device.platform,
      keyVersion: device.keyVersion,
      identityChangedAt: device.identityChangedAt,
      lastSeenAt: device.lastSeenAt,
      revokedAt: device.revokedAt,
      createdAt: device.createdAt,
      current: device.deviceUuid === currentDeviceUuid,
    };
  }

  private mapPublicBundle(
    device: UserDeviceEntity,
    preKey: ClaimedPreKeyRow | null,
  ): PublicDeviceKeyBundle {
    return {
      deviceID: device.id,
      deviceUuid: device.deviceUuid,
      deviceName: device.deviceName,
      platform: device.platform,
      registrationId: device.registrationId,
      identityPublicKey: device.identityPublicKey.toString("base64"),
      signedPreKey: device.signedPreKey.toString("base64"),
      signedPreKeyId: device.signedPreKeyId,
      signedPreKeySignature: device.signedPreKeySignature.toString("base64"),
      keyVersion: device.keyVersion,
      identityChanged: device.identityChangedAt !== null,
      identityChangedAt: device.identityChangedAt,
      oneTimePreKey: preKey
        ? {
            keyId: preKey.keyId,
            publicKey: preKey.publicKey.toString("base64"),
          }
        : null,
    };
  }

  private consumeRateLimit(
    user: AuthenticatedUser,
    action: string,
    maxRequests: number,
    windowMs = 60 * 1_000,
  ): void {
    this.rateLimitService.consume(
      `e2ee:${action}:${user.sub}:${user.deviceUuid}`,
      {
        maxRequests,
        windowMs,
        message: "Too many encrypted key-management requests",
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
