import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, MoreThan, Repository } from "typeorm";
import {
  ContactRequestEntity,
  ContactRequestStatus,
} from "../../entities/contact-request.entity";
import {
  LocationPermissionEntity,
  LocationPermissionStatus,
} from "../../entities/location-permission.entity";
import { LocationShareEntity } from "../../entities/location-share.entity";
import { UserEntity } from "../../entities/user.entity";
import { isE2EERequired } from "../common/runtime-config";
import { GrantLocationPermissionDto } from "./dto/grant-location-permission.dto";
import { UpdateLocationDto } from "./dto/update-location.dto";

const OUTDATED_LOCATION_THRESHOLD_MS = 10 * 60 * 1000;
const MAX_PERMISSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

type MyLocationResponse = {
  sharingEnabled: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  updatedAt: Date | null;
};

type ContactLocationResponse = {
  userID: string;
  displayName: string;
  phone: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updatedAt: Date;
  isOutdated: boolean;
  permissionExpiresAt: Date;
};

type LocationPermissionResponse = {
  granteeUserID: string;
  displayName: string;
  status: LocationPermissionStatus;
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(LocationShareEntity)
    private readonly locationSharesRepository: Repository<LocationShareEntity>,
    @InjectRepository(LocationPermissionEntity)
    private readonly locationPermissionsRepository: Repository<LocationPermissionEntity>,
    @InjectRepository(ContactRequestEntity)
    private readonly contactRequestsRepository: Repository<ContactRequestEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async getMyLocation(userId: string): Promise<MyLocationResponse> {
    this.assertLegacyCoordinatesAllowed();
    const share = await this.locationSharesRepository.findOneBy({ userId });
    if (!share) {
      return {
        sharingEnabled: false,
        latitude: null,
        longitude: null,
        accuracy: null,
        updatedAt: null,
      };
    }

    return this.mapMyLocation(share);
  }

  async updateMyLocation(
    userId: string,
    dto: UpdateLocationDto,
  ): Promise<MyLocationResponse> {
    this.assertLegacyCoordinatesAllowed();
    await this.requireUser(userId);

    const existing = await this.locationSharesRepository.findOneBy({ userId });
    const share = existing ?? this.locationSharesRepository.create({ userId });
    share.latitude = dto.latitude;
    share.longitude = dto.longitude;
    share.accuracy = dto.accuracy ?? null;
    share.sharingEnabled = dto.sharingEnabled;

    const saved = await this.locationSharesRepository.save(share);
    return this.mapMyLocation(saved);
  }

  async disableMyLocation(userId: string): Promise<{ ok: true }> {
    await this.requireUser(userId);

    const existing = await this.locationSharesRepository.findOneBy({ userId });
    if (!existing) {
      await this.locationSharesRepository.save(
        this.locationSharesRepository.create({
          userId,
          sharingEnabled: false,
          latitude: null,
          longitude: null,
          accuracy: null,
        }),
      );
      return { ok: true };
    }

    existing.sharingEnabled = false;
    existing.latitude = null;
    existing.longitude = null;
    existing.accuracy = null;
    await this.locationSharesRepository.save(existing);
    return { ok: true };
  }

  async grantPermission(
    ownerUserID: string,
    granteeUserID: string,
    dto: GrantLocationPermissionDto,
  ): Promise<LocationPermissionResponse> {
    if (ownerUserID === granteeUserID) {
      throw new BadRequestException(
        "A location permission must target another user",
      );
    }

    const contactRequest = await this.requireAcceptedContact(
      ownerUserID,
      granteeUserID,
    );
    const expiresAt = new Date(dto.expiresAt);
    const now = new Date();
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= now.getTime()
    ) {
      throw new BadRequestException("Permission expiry must be in the future");
    }
    if (expiresAt.getTime() - now.getTime() > MAX_PERMISSION_LIFETIME_MS) {
      throw new BadRequestException(
        "Location permission cannot exceed 30 days",
      );
    }

    const existing = await this.locationPermissionsRepository.findOneBy({
      ownerUserId: ownerUserID,
      granteeUserId: granteeUserID,
    });
    const permission =
      existing ??
      this.locationPermissionsRepository.create({
        ownerUserId: ownerUserID,
        granteeUserId: granteeUserID,
      });
    permission.contactRequestId = contactRequest.id;
    permission.status = LocationPermissionStatus.ACTIVE;
    permission.grantedAt = now;
    permission.expiresAt = expiresAt;
    permission.revokedAt = null;

    const saved = await this.locationPermissionsRepository.save(permission);
    const grantee = await this.requireUser(granteeUserID);
    return this.mapPermission(saved, grantee);
  }

  async listPermissions(
    ownerUserID: string,
  ): Promise<LocationPermissionResponse[]> {
    const permissions = await this.locationPermissionsRepository.find({
      where: { ownerUserId: ownerUserID },
      relations: { granteeUser: true, contactRequest: true },
      order: { updatedAt: "DESC" },
    });

    return permissions
      .filter(
        (permission) =>
          permission.contactRequest.status === ContactRequestStatus.ACCEPTED,
      )
      .map((permission) =>
        this.mapPermission(permission, permission.granteeUser),
      );
  }

  async revokePermission(
    ownerUserID: string,
    granteeUserID: string,
  ): Promise<{ ok: true }> {
    const permission = await this.locationPermissionsRepository.findOneBy({
      ownerUserId: ownerUserID,
      granteeUserId: granteeUserID,
    });
    if (!permission) {
      throw new NotFoundException("Location permission not found");
    }

    permission.status = LocationPermissionStatus.REVOKED;
    permission.revokedAt = new Date();
    await this.locationPermissionsRepository.save(permission);
    return { ok: true };
  }

  async getContactLocations(
    userId: string,
  ): Promise<ContactLocationResponse[]> {
    this.assertLegacyCoordinatesAllowed();
    const now = new Date();
    const permissions = await this.locationPermissionsRepository.find({
      where: {
        granteeUserId: userId,
        status: LocationPermissionStatus.ACTIVE,
        expiresAt: MoreThan(now),
      },
      relations: {
        ownerUser: true,
        contactRequest: true,
      },
      order: { grantedAt: "ASC" },
    });
    const authorized = permissions.filter((permission) =>
      isAcceptedRelationship(
        permission.contactRequest,
        permission.ownerUserId,
        userId,
      ),
    );
    if (authorized.length === 0) {
      return [];
    }

    const shares = await this.locationSharesRepository.findBy({
      userId: In(authorized.map((permission) => permission.ownerUserId)),
      sharingEnabled: true,
    });
    const shareByUserId = new Map(shares.map((share) => [share.userId, share]));

    return authorized.flatMap((permission) => {
      const share = shareByUserId.get(permission.ownerUserId);
      if (!share || share.latitude == null || share.longitude == null) {
        return [];
      }

      return [
        {
          userID: permission.ownerUser.id,
          displayName: permission.ownerUser.displayName,
          phone: permission.ownerUser.phone ?? permission.ownerUser.contact,
          latitude: share.latitude,
          longitude: share.longitude,
          accuracy: share.accuracy,
          updatedAt: share.updatedAt,
          isOutdated:
            Date.now() - share.updatedAt.getTime() >
            OUTDATED_LOCATION_THRESHOLD_MS,
          permissionExpiresAt: permission.expiresAt as Date,
        },
      ];
    });
  }

  private async requireAcceptedContact(
    firstUserID: string,
    secondUserID: string,
  ): Promise<ContactRequestEntity> {
    const pairKey = [firstUserID, secondUserID].sort().join(":");
    const request = await this.contactRequestsRepository.findOneBy({
      pairKey,
      status: ContactRequestStatus.ACCEPTED,
    });
    if (!request) {
      throw new ForbiddenException(
        "Location can only be shared with an accepted contact",
      );
    }
    return request;
  }

  private assertLegacyCoordinatesAllowed(): void {
    if (isE2EERequired()) {
      throw new ForbiddenException(
        "Plaintext location endpoints are disabled while E2EE is required",
      );
    }
  }

  private mapMyLocation(share: LocationShareEntity): MyLocationResponse {
    return {
      sharingEnabled: share.sharingEnabled,
      latitude: share.sharingEnabled ? share.latitude : null,
      longitude: share.sharingEnabled ? share.longitude : null,
      accuracy: share.sharingEnabled ? share.accuracy : null,
      updatedAt: share.updatedAt,
    };
  }

  private mapPermission(
    permission: LocationPermissionEntity,
    grantee: UserEntity,
  ): LocationPermissionResponse {
    return {
      granteeUserID: grantee.id,
      displayName: grantee.displayName,
      status: permission.status,
      grantedAt: permission.grantedAt,
      expiresAt: permission.expiresAt,
      revokedAt: permission.revokedAt,
    };
  }

  private async requireUser(userId: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOneBy({
      id: userId as UserEntity["id"],
    });
    if (!user) {
      throw new BadRequestException("User not found");
    }
    return user;
  }
}

function isAcceptedRelationship(
  request: ContactRequestEntity,
  firstUserID: string,
  secondUserID: string,
): boolean {
  return (
    request.status === ContactRequestStatus.ACCEPTED &&
    ((request.requesterUserId === firstUserID &&
      request.recipientUserId === secondUserID) ||
      (request.requesterUserId === secondUserID &&
        request.recipientUserId === firstUserID))
  );
}
