import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ContactEntity } from "../../entities/contact.entity";
import { UserEntity } from "../../entities/user.entity";
import { ChatService } from "../chat/chat.service";
import { normalizePhone } from "../common/contact.utils";

type ContactResponse = {
  id: string;
  userID: string;
  displayName: string;
  phone: string;
  createdAt: Date;
  directChatID: string | null;
};

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(ContactEntity)
    private readonly contactsRepository: Repository<ContactEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly chatService: ChatService,
  ) {}

  async listContacts(ownerUserId: string): Promise<ContactResponse[]> {
    const contacts = await this.contactsRepository.find({
      where: { ownerUserId },
      relations: { contactUser: true },
      order: { createdAt: "ASC" },
    });

    const directChatIDByUserID =
      await this.chatService.findExistingDirectChatIDsByUsers(
        ownerUserId,
        contacts.map((contact) => contact.contactUserId),
      );

    return contacts.map((contact) =>
      this.mapContact(
        contact,
        directChatIDByUserID.get(contact.contactUserId) ?? null,
      ),
    );
  }

  async addContact(
    ownerUserId: string,
    rawPhone: string,
  ): Promise<ContactResponse & { alreadyExists?: boolean }> {
    const normalizedPhone = normalizePhone(rawPhone);
    const owner = await this.requireUser(ownerUserId);
    const contactUser = await this.usersRepository.findOne({
      where: [{ phone: normalizedPhone }, { contact: normalizedPhone }],
    });

    if (!contactUser) {
      throw new HttpException(
        {
          code: "USER_NOT_FOUND",
          message: "User with this phone number was not found",
        },
        HttpStatus.NOT_FOUND,
      );
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

    const existing = await this.contactsRepository.findOne({
      where: {
        ownerUserId,
        contactUserId: contactUser.id,
      },
      relations: { contactUser: true },
    });

    if (existing) {
      const directChat = await this.chatService.findExistingDirectChatByUsers(
        ownerUserId,
        contactUser.id,
      );
      return {
        ...this.mapContact(existing, directChat?.id ?? null),
        alreadyExists: true,
      };
    }

    const saved = await this.contactsRepository.save(
      this.contactsRepository.create({
        ownerUserId,
        contactUserId: contactUser.id,
      }),
    );

    const hydrated = await this.contactsRepository.findOne({
      where: { id: saved.id },
      relations: { contactUser: true },
    });
    if (!hydrated) {
      throw new BadRequestException("Failed to create contact");
    }

    const directChat = await this.chatService.findOrCreateDirectChat(
      owner.id,
      contactUser.id,
    );
    return this.mapContact(hydrated, directChat.id);
  }

  async removeContact(
    ownerUserId: string,
    identifier: string,
  ): Promise<{
    ok: true;
  }> {
    const deleteById = await this.contactsRepository.delete({
      id: identifier as ContactEntity["id"],
      ownerUserId,
    });
    if ((deleteById.affected ?? 0) > 0) {
      return { ok: true };
    }

    const deleteByUser = await this.contactsRepository.delete({
      ownerUserId,
      contactUserId: identifier,
    });
    if ((deleteByUser.affected ?? 0) > 0) {
      return { ok: true };
    }

    throw new NotFoundException("Contact not found");
  }

  private mapContact(
    contact: ContactEntity,
    directChatID: string | null,
  ): ContactResponse {
    return {
      id: contact.id,
      userID: contact.contactUser.id,
      displayName: contact.contactUser.displayName,
      phone: contact.contactUser.phone ?? contact.contactUser.contact,
      createdAt: contact.createdAt,
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
