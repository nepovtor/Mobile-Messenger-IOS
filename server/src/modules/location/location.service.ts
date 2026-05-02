import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ContactEntity } from "../../entities/contact.entity";
import { LocationShareEntity } from "../../entities/location-share.entity";
import { UserEntity } from "../../entities/user.entity";
import { UpdateLocationDto } from "./dto/update-location.dto";

const OUTDATED_LOCATION_THRESHOLD_MS = 10 * 60 * 1000;

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
};

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(LocationShareEntity)
    private readonly locationSharesRepository: Repository<LocationShareEntity>,
    @InjectRepository(ContactEntity)
    private readonly contactsRepository: Repository<ContactEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async getMyLocation(userId: string): Promise<MyLocationResponse> {
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

  async getContactLocations(userId: string): Promise<ContactLocationResponse[]> {
    const contacts = await this.contactsRepository.find({
      where: { ownerUserId: userId },
      relations: { contactUser: true },
      order: { createdAt: "ASC" },
    });

    if (contacts.length === 0) {
      return [];
    }

    const shares = await this.locationSharesRepository.findBy({
      sharingEnabled: true,
    });
    const shareByUserId = new Map(shares.map((share) => [share.userId, share]));

    return contacts.flatMap((contact) => {
      const share = shareByUserId.get(contact.contactUserId);
      if (!share || share.latitude == null || share.longitude == null) {
        return [];
      }

      return [
        {
          userID: contact.contactUser.id,
          displayName: contact.contactUser.displayName,
          phone: contact.contactUser.phone ?? contact.contactUser.contact,
          latitude: share.latitude,
          longitude: share.longitude,
          accuracy: share.accuracy,
          updatedAt: share.updatedAt,
          isOutdated:
            Date.now() - share.updatedAt.getTime() >
            OUTDATED_LOCATION_THRESHOLD_MS,
        },
      ];
    });
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

  private async requireUser(userId: string): Promise<void> {
    const user = await this.usersRepository.findOneBy({
      id: userId as UserEntity["id"],
    });
    if (!user) {
      throw new BadRequestException("User not found");
    }
  }
}
