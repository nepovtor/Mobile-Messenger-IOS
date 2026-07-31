import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChatEntity } from "../../entities/chat.entity";
import {
  ContactRequestEntity,
  ContactRequestStatus,
} from "../../entities/contact-request.entity";
import { ContactEntity } from "../../entities/contact.entity";
import {
  LocationPermissionEntity,
  LocationPermissionStatus,
} from "../../entities/location-permission.entity";
import { UserEntity } from "../../entities/user.entity";
import { ChatService } from "../chat/chat.service";
import { normalizePhone } from "../common/contact.utils";

type ContactResponse = {
  id: string;
  requestID: string;
  userID: string;
  displayName: string;
  phone: string;
  createdAt: Date;
  directChatID: string | null;
};

type ContactRequestResponse = {
  requestID: null;
  status: ContactRequestStatus.PENDING;
};

type PendingContactRequestResponse = {
  requestID: string;
  requesterDisplayName: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(ContactEntity)
    private readonly contactsRepository: Repository<ContactEntity>,
    @InjectRepository(ContactRequestEntity)
    private readonly contactRequestsRepository: Repository<ContactRequestEntity>,
    @InjectRepository(LocationPermissionEntity)
    private readonly locationPermissionsRepository: Repository<LocationPermissionEntity>,
    @InjectRepository(ChatEntity)
    private readonly chatsRepository: Repository<ChatEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly chatService: ChatService,
  ) {}

  async listContacts(ownerUserId: string): Promise<ContactResponse[]> {
    const requests = await this.contactRequestsRepository.find({
      where: [
        {
          requesterUserId: ownerUserId,
          status: ContactRequestStatus.ACCEPTED,
        },
        {
          recipientUserId: ownerUserId,
          status: ContactRequestStatus.ACCEPTED,
        },
      ],
      relations: {
        requesterUser: true,
        recipientUser: true,
      },
      order: { respondedAt: "ASC", createdAt: "ASC" },
    });

    const contactUserIDs = requests.map((request) =>
      request.requesterUserId === ownerUserId
        ? request.recipientUserId
        : request.requesterUserId,
    );
    const directChatIDByUserID =
      await this.chatService.findExistingDirectChatIDsByUsers(
        ownerUserId,
        contactUserIDs,
      );

    return requests.map((request) => {
      const contactUser =
        request.requesterUserId === ownerUserId
          ? request.recipientUser
          : request.requesterUser;
      return this.mapAcceptedContact(
        request,
        contactUser,
        directChatIDByUserID.get(contactUser.id) ?? null,
      );
    });
  }

  async listPendingRequests(userID: string): Promise<{
    incoming: PendingContactRequestResponse[];
  }> {
    const requests = await this.contactRequestsRepository.find({
      where: {
        recipientUserId: userID,
        status: ContactRequestStatus.PENDING,
      },
      relations: { requesterUser: true },
      order: { createdAt: "ASC" },
    });

    return {
      incoming: requests.map((request) => ({
        requestID: request.id,
        requesterDisplayName: request.requesterUser.displayName,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      })),
    };
  }

  async addContact(
    ownerUserId: string,
    rawPhone: string,
  ): Promise<ContactRequestResponse | ContactResponse> {
    const normalizedPhone = normalizePhone(rawPhone);
    const owner = await this.requireUser(ownerUserId);
    const contactUser = await this.usersRepository.findOne({
      where: [{ phone: normalizedPhone }, { contact: normalizedPhone }],
    });

    // A generic response prevents this endpoint from becoming a phone-number
    // enumeration oracle. No target profile data is returned before acceptance.
    if (!contactUser) {
      return {
        requestID: null,
        status: ContactRequestStatus.PENDING,
      };
    }

    if (contactUser.id === owner.id) {
      throw new HttpException(
        {
          code: "CANNOT_ADD_SELF",
          message: "You cannot add yourself to contacts",
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const pairKey = buildPairKey(owner.id, contactUser.id);
    const existing = await this.contactRequestsRepository.findOne({
      where: { pairKey },
      relations: { requesterUser: true, recipientUser: true },
    });

    if (existing?.status === ContactRequestStatus.ACCEPTED) {
      const directChat = await this.chatService.findExistingDirectChatByUsers(
        owner.id,
        contactUser.id,
      );
      return this.mapAcceptedContact(
        existing,
        contactUser,
        directChat?.id ?? null,
      );
    }

    if (existing?.status === ContactRequestStatus.BLOCKED) {
      if (existing.blockedByUserId === owner.id) {
        throw new ConflictException(
          "Unblock this user before sending another contact request",
        );
      }

      return {
        requestID: null,
        status: ContactRequestStatus.PENDING,
      };
    }

    if (existing?.status === ContactRequestStatus.PENDING) {
      return {
        requestID: null,
        status: ContactRequestStatus.PENDING,
      };
    }

    const request =
      existing ??
      this.contactRequestsRepository.create({
        pairKey,
      });
    request.requesterUserId = owner.id;
    request.recipientUserId = contactUser.id;
    request.status = ContactRequestStatus.PENDING;
    request.blockedByUserId = null;
    request.respondedAt = null;

    try {
      await this.contactRequestsRepository.save(request);
      return {
        requestID: null,
        status: ContactRequestStatus.PENDING,
      };
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      return {
        requestID: null,
        status: ContactRequestStatus.PENDING,
      };
    }
  }

  async acceptRequest(
    recipientUserID: string,
    requestID: string,
  ): Promise<ContactResponse> {
    const request = await this.requireRequest(requestID);
    if (request.recipientUserId !== recipientUserID) {
      throw new NotFoundException("Contact request not found");
    }
    if (request.status !== ContactRequestStatus.PENDING) {
      throw new ConflictException("Contact request is no longer pending");
    }

    request.status = ContactRequestStatus.ACCEPTED;
    request.respondedAt = new Date();
    request.blockedByUserId = null;
    await this.contactRequestsRepository.save(request);

    await this.ensureBidirectionalContactRows(
      request.requesterUserId,
      request.recipientUserId,
    );
    const directChat = await this.chatService.findOrCreateDirectChat(
      request.requesterUserId,
      request.recipientUserId,
    );

    return this.mapAcceptedContact(
      request,
      request.requesterUser,
      directChat.id,
    );
  }

  async rejectRequest(
    recipientUserID: string,
    requestID: string,
  ): Promise<{ ok: true }> {
    const request = await this.requireRequest(requestID);
    if (request.recipientUserId !== recipientUserID) {
      throw new NotFoundException("Contact request not found");
    }
    if (request.status !== ContactRequestStatus.PENDING) {
      throw new ConflictException("Contact request is no longer pending");
    }

    request.status = ContactRequestStatus.REJECTED;
    request.respondedAt = new Date();
    request.blockedByUserId = null;
    await this.contactRequestsRepository.save(request);
    await this.removeRelationshipData(
      request.requesterUserId,
      request.recipientUserId,
    );
    return { ok: true };
  }

  async blockContact(
    userID: string,
    otherUserID: string,
  ): Promise<{ ok: true }> {
    if (userID === otherUserID) {
      throw new BadRequestException("You cannot block yourself");
    }

    const request = await this.contactRequestsRepository.findOneBy({
      pairKey: buildPairKey(userID, otherUserID),
    });
    if (!request) {
      throw new NotFoundException("Contact relationship not found");
    }

    request.status = ContactRequestStatus.BLOCKED;
    request.blockedByUserId = userID;
    request.respondedAt = new Date();
    await this.contactRequestsRepository.save(request);
    await this.removeRelationshipData(userID, otherUserID);
    return { ok: true };
  }

  async unblockContact(
    userID: string,
    otherUserID: string,
  ): Promise<{ ok: true }> {
    const request = await this.contactRequestsRepository.findOneBy({
      pairKey: buildPairKey(userID, otherUserID),
    });
    if (
      !request ||
      request.status !== ContactRequestStatus.BLOCKED ||
      request.blockedByUserId !== userID
    ) {
      throw new NotFoundException("Blocked contact not found");
    }

    request.status = ContactRequestStatus.REJECTED;
    request.blockedByUserId = null;
    request.respondedAt = new Date();
    await this.contactRequestsRepository.save(request);
    return { ok: true };
  }

  async removeContact(
    ownerUserId: string,
    identifier: string,
  ): Promise<{ ok: true }> {
    const contact = await this.contactsRepository.findOne({
      where: [
        {
          id: identifier as ContactEntity["id"],
          ownerUserId,
        },
        {
          ownerUserId,
          contactUserId: identifier,
        },
      ],
    });
    if (!contact) {
      throw new NotFoundException("Contact not found");
    }

    const request = await this.contactRequestsRepository.findOneBy({
      pairKey: buildPairKey(ownerUserId, contact.contactUserId),
    });
    if (request?.status === ContactRequestStatus.ACCEPTED) {
      request.status = ContactRequestStatus.REJECTED;
      request.respondedAt = new Date();
      request.blockedByUserId = null;
      await this.contactRequestsRepository.save(request);
    }

    await this.removeRelationshipData(ownerUserId, contact.contactUserId);
    return { ok: true };
  }

  private async requireRequest(
    requestID: string,
  ): Promise<ContactRequestEntity> {
    const request = await this.contactRequestsRepository.findOne({
      where: { id: requestID as ContactRequestEntity["id"] },
      relations: { requesterUser: true, recipientUser: true },
    });
    if (!request) {
      throw new NotFoundException("Contact request not found");
    }
    return request;
  }

  private async ensureBidirectionalContactRows(
    firstUserID: string,
    secondUserID: string,
  ): Promise<void> {
    for (const [ownerUserId, contactUserId] of [
      [firstUserID, secondUserID],
      [secondUserID, firstUserID],
    ] as const) {
      const existing = await this.contactsRepository.findOneBy({
        ownerUserId,
        contactUserId,
      });
      if (!existing) {
        await this.contactsRepository.save(
          this.contactsRepository.create({ ownerUserId, contactUserId }),
        );
      }
    }
  }

  private async removeRelationshipData(
    firstUserID: string,
    secondUserID: string,
  ): Promise<void> {
    await this.contactsRepository.delete([
      { ownerUserId: firstUserID, contactUserId: secondUserID },
      { ownerUserId: secondUserID, contactUserId: firstUserID },
    ]);

    const permissions = await this.locationPermissionsRepository.find({
      where: [
        { ownerUserId: firstUserID, granteeUserId: secondUserID },
        { ownerUserId: secondUserID, granteeUserId: firstUserID },
      ],
    });
    const revokedAt = new Date();
    for (const permission of permissions) {
      permission.status = LocationPermissionStatus.REVOKED;
      permission.revokedAt = revokedAt;
    }
    if (permissions.length > 0) {
      await this.locationPermissionsRepository.save(permissions);
    }

    const directChat = await this.chatService.findExistingDirectChatByUsers(
      firstUserID,
      secondUserID,
    );
    if (directChat) {
      await this.chatsRepository.increment(
        { id: directChat.id },
        "encryptionEpoch",
        1,
      );
    }
  }

  private mapAcceptedContact(
    request: ContactRequestEntity,
    contactUser: UserEntity,
    directChatID: string | null,
  ): ContactResponse {
    return {
      id: request.id,
      requestID: request.id,
      userID: contactUser.id,
      displayName: contactUser.displayName,
      phone: contactUser.phone ?? contactUser.contact,
      createdAt: request.respondedAt ?? request.createdAt,
      directChatID,
    };
  }

  private async requireUser(userID: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOneBy({
      id: userID as UserEntity["id"],
    });
    if (!user) {
      throw new BadRequestException("User not found");
    }
    return user;
  }
}

export function buildPairKey(
  firstUserID: string,
  secondUserID: string,
): string {
  return [firstUserID, secondUserID].sort().join(":");
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
