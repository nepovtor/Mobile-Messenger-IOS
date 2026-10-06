import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  LessThanOrEqual,
  Not,
  QueryFailedError,
  Repository,
} from "typeorm";
import { ChatEntity } from "../../entities/chat.entity";
import { ChatParticipantEntity } from "../../entities/chat-participant.entity";
import { MediaEntity } from "../../entities/media.entity";
import {
  MessageEntity,
  MessageKind,
  MessageStatus,
} from "../../entities/message.entity";
import { AuthMethod, UserEntity } from "../../entities/user.entity";
import { AuthenticatedUser } from "../common/authenticated-user";
import { normalizeContact } from "../common/contact.utils";
import {
  isE2EEEnabled,
  isE2EERequired,
  isLegacyMessagesReadEnabled,
} from "../common/runtime-config";
import { ChatEventsService } from "../chat-events/chat-events.service";
import { MediaService } from "../media/media.service";
import { PushService } from "../push/push.service";
import { CreateChatDto } from "./dto/create-chat.dto";
import { ChatPresenter } from "./chat.presenter";
import { SendMessageDto } from "./dto/send-message.dto";
import { SetTypingDto } from "./dto/set-typing.dto";
import { UpdateMessageDto } from "./dto/update-message.dto";

export type Chat = ChatSummary;
export type Message = MessageResponse;

export interface ChatSummary {
  id: string;
  title: string;
  lastMessagePreview: string | null;
  lastActivity: Date;
  unreadCount: number;
  typingParticipants: string[];
  participantNames: string[];
  participantCount: number;
}

export interface MessageResponse {
  id: string;
  messageID: string;
  chatID: string;
  authorID: string;
  authorName: string;
  kind: MessageKind;
  text: string | null;
  mediaID: string | null;
  mediaURL: string | null;
  status: MessageStatus;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
}

interface RealtimeSendMessageDto {
  clientMessageId: string;
  kind: MessageKind;
  text?: string;
  mediaID?: string;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ChatEntity)
    private readonly chatsRepository: Repository<ChatEntity>,
    @InjectRepository(ChatParticipantEntity)
    private readonly participantsRepository: Repository<ChatParticipantEntity>,
    @InjectRepository(MessageEntity)
    private readonly messagesRepository: Repository<MessageEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly chatEvents: ChatEventsService,
    private readonly mediaService: MediaService,
    private readonly pushService: PushService,
    private readonly presenter: ChatPresenter,
  ) {}

  async createChat(
    dto: CreateChatDto,
    user: AuthenticatedUser,
  ): Promise<ChatSummary> {
    const title = dto.title.trim();
    if (!title) {
      throw new BadRequestException("Chat title is required");
    }

    const otherUsers = await this.resolveParticipants(dto);
    const participantIDs = new Set([
      user.sub,
      ...otherUsers.map((item) => item.id),
    ]);
    const normalizedParticipantIDs = Array.from(participantIDs).sort();

    if (normalizedParticipantIDs.length === 2) {
      const existingDirectChat = await this.findExistingDirectChat(
        normalizedParticipantIDs,
      );
      if (existingDirectChat) {
        const wasRestored = await this.restoreChatForUser(
          existingDirectChat.id,
          user.sub,
        );
        const summary = await this.getChatSummary(
          existingDirectChat.id,
          user.sub,
        );
        if (wasRestored) {
          this.chatEvents.publishToUsers([user.sub], {
            type: "chat.created",
            payload: {
              chatID: existingDirectChat.id,
              chat: summary,
            },
          });
        }
        return summary;
      }
    }

    const chat = await this.chatsRepository.save(
      this.chatsRepository.create({
        title,
        lastMessageId: null,
        lastActivity: new Date(),
        encryptionEpoch: 1,
        e2eeRequired: isE2EEEnabled() || isE2EERequired(),
      }),
    );

    const participantEntities = Array.from(participantIDs).map(
      (participantID) =>
        this.participantsRepository.create({
          chatId: chat.id,
          userId: participantID,
          lastReadAt: null,
          lastReadMessageId: null,
        }),
    );
    await this.participantsRepository.save(participantEntities);

    const summary = await this.getChatSummary(chat.id, user.sub);
    const createdPayload = { chatID: chat.id, chat: summary };
    this.chatEvents.publishToUsers(Array.from(participantIDs), {
      type: "chat.created",
      payload: createdPayload,
    });
    return summary;
  }

  async listChats(userID: string, search?: string): Promise<ChatSummary[]> {
    if (search?.trim() && isE2EERequired()) {
      throw new ForbiddenException(
        "Server-side message search is disabled for E2EE",
      );
    }
    const participants = await this.participantsRepository.find({
      where: { userId: userID, hiddenAt: IsNull() },
      relations: { chat: { lastMessage: true } },
      order: { chat: { lastActivity: "DESC" } },
    });

    const summaries = await this.presenter.buildSummaries(
      participants.map((participant) => ({
        chat: participant.chat,
        participant,
      })),
      userID,
    );

    const normalizedSearch = search?.trim().toLowerCase();
    const filtered = summaries.filter(({ summary }) => {
      if (!normalizedSearch) {
        return true;
      }

      return [
        summary.title,
        summary.lastMessagePreview ?? "",
        ...summary.participantNames,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    });

    filtered.sort(
      (left, right) =>
        right.summary.lastActivity.getTime() -
        left.summary.lastActivity.getTime(),
    );

    const deduped = new Map<string, ChatSummary>();
    for (const item of filtered) {
      if (!deduped.has(item.dedupeKey)) {
        deduped.set(item.dedupeKey, item.summary);
      }
    }

    return Array.from(deduped.values());
  }

  async deleteChat(
    chatID: string,
    user: AuthenticatedUser,
  ): Promise<{ ok: true; chatID: string }> {
    const participant = await this.getParticipantOrFail(chatID, user.sub);
    const latestMessage = await this.messagesRepository.findOne({
      where: { chatId: chatID },
      order: { createdAt: "DESC" },
    });

    participant.hiddenAt = new Date();
    participant.lastReadAt = latestMessage?.createdAt ?? participant.lastReadAt;
    participant.lastReadMessageId =
      latestMessage?.id ?? participant.lastReadMessageId;
    await this.participantsRepository.save(participant);

    this.chatEvents.setTyping(chatID, user.sub, user.displayName, false);
    this.chatEvents.publishToUsers([user.sub], {
      type: "chat.deleted",
      payload: { chatID },
    });

    return { ok: true, chatID };
  }

  async getMessages(
    chatID: string,
    userID: string,
    limit = 100,
    before?: string,
  ): Promise<MessageResponse[]> {
    this.requireLegacyMessageReads();
    await this.getParticipantOrFail(chatID, userID);

    let createdBefore: Date | undefined;
    if (before) {
      const beforeMessage = await this.messagesRepository.findOneBy({
        id: before as MessageEntity["id"],
        chatId: chatID,
      });
      if (beforeMessage) {
        createdBefore = beforeMessage.createdAt;
      }
    }

    const query = this.messagesRepository
      .createQueryBuilder("message")
      .leftJoinAndSelect("message.author", "author")
      .leftJoinAndSelect("message.media", "media")
      .where("message.chat_id = :chatID", { chatID })
      .orderBy("message.createdAt", "DESC")
      .addOrderBy("message.id", "DESC")
      .take(Math.min(Math.max(limit, 1), 200));

    if (createdBefore && before) {
      query.andWhere(
        "(message.created_at < :createdBefore OR (message.created_at = :createdBefore AND message.id < :before))",
        { createdBefore, before },
      );
    }

    const ascending = (await query.getMany()).reverse();
    return Promise.all(
      ascending.map((message) => this.presenter.mapMessage(message)),
    );
  }

  async addMessage(
    chatID: string,
    dto: SendMessageDto,
    user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.createMessage(
      chatID,
      {
        clientMessageId: dto.messageID,
        kind: dto.kind,
        text: dto.text,
        mediaID: dto.mediaID,
      },
      user,
    );
  }

  async addRealtimeMessage(
    chatID: string,
    dto: RealtimeSendMessageDto,
    user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.createMessage(chatID, dto, user);
  }

  async setRealtimeTyping(
    chatID: string,
    dto: SetTypingDto,
    user: AuthenticatedUser,
  ): Promise<{
    chatID: string;
    userID: string;
    isTyping: boolean;
    typingParticipants: string[];
  }> {
    return this.setTyping(chatID, dto, user);
  }

  private async createMessage(
    chatID: string,
    dto: RealtimeSendMessageDto,
    user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    const result = await this.withPlaintextChat(
      chatID,
      async (manager, chat) => {
        const participantsRepository = manager.getRepository(
          ChatParticipantEntity,
        );
        const messagesRepository = manager.getRepository(MessageEntity);
        const participant = await this.getParticipantOrFail(
          chatID,
          user.sub,
          manager,
        );
        const participants = await participantsRepository.find({
          where: { chatId: chatID },
        });
        const restoredParticipantIDs = participants
          .filter((item) => item.hiddenAt != null)
          .map((item) => item.userId);

        const existingMessage = await messagesRepository.findOne({
          where: {
            chatId: chatID,
            authorId: user.sub,
            clientMessageId: dto.clientMessageId,
          },
          relations: { author: true, media: true },
        });
        if (existingMessage) {
          return { existingMessage };
        }

        const trimmedText = dto.text?.trim();
        let media: MediaEntity | null = null;
        if (dto.kind === MessageKind.TEXT) {
          if (!trimmedText) {
            throw new BadRequestException("Text message must contain text");
          }
        } else if (
          dto.kind === MessageKind.IMAGE ||
          dto.kind === MessageKind.AUDIO
        ) {
          const mediaLabel = dto.kind === MessageKind.AUDIO ? "Audio" : "Image";
          if (!dto.mediaID) {
            throw new BadRequestException(
              `${mediaLabel} message must contain mediaID`,
            );
          }
          media = await this.mediaService.getUploadedMediaOrFail(dto.mediaID);
          if (media.uploadedById !== user.sub) {
            throw new BadRequestException("Media belongs to another user");
          }
          const expectedPrefix =
            dto.kind === MessageKind.AUDIO ? "audio/" : "image/";
          if (!media.mimeType.startsWith(expectedPrefix)) {
            throw new BadRequestException(
              `${mediaLabel} message contains incompatible media`,
            );
          }
        } else {
          throw new BadRequestException("Unsupported message kind");
        }

        const message = await messagesRepository.save(
          messagesRepository.create({
            chatId: chatID,
            authorId: user.sub,
            clientMessageId: dto.clientMessageId,
            kind: dto.kind,
            text: trimmedText || null,
            mediaId: media?.id ?? null,
            status:
              participants.length > 1
                ? MessageStatus.DELIVERED
                : MessageStatus.SENT,
          }),
        );

        for (const chatParticipant of participants) {
          chatParticipant.hiddenAt = null;
          if (chatParticipant.userId === user.sub) {
            chatParticipant.lastReadAt = message.createdAt;
            chatParticipant.lastReadMessageId = message.id;
          }
        }
        if (!participants.some((item) => item.userId === user.sub)) {
          participant.hiddenAt = null;
          participant.lastReadAt = message.createdAt;
          participant.lastReadMessageId = message.id;
          participants.push(participant);
        }
        await participantsRepository.save(participants);
        chat.lastMessageId = message.id;
        chat.lastActivity = message.createdAt;
        await manager.getRepository(ChatEntity).save(chat);

        const hydratedMessage = await messagesRepository.findOne({
          where: { id: message.id },
          relations: { author: true, media: true },
        });
        if (!hydratedMessage) {
          throw new NotFoundException("Message not found after save");
        }
        return { hydratedMessage, participants, restoredParticipantIDs, chat };
      },
    );

    if (result.existingMessage) {
      return this.presenter.mapMessage(result.existingMessage);
    }
    const { hydratedMessage, participants, restoredParticipantIDs, chat } =
      result;
    for (const restoredUserID of restoredParticipantIDs) {
      const summary = await this.getChatSummary(chatID, restoredUserID);
      this.chatEvents.publishToUsers([restoredUserID], {
        type: "chat.created",
        payload: { chatID, chat: summary },
      });
    }
    const payload = await this.presenter.mapMessage(hydratedMessage);
    this.chatEvents.broadcastToChatParticipants(participants, {
      event: "message.created",
      data: { chatID, message: payload },
    });
    void this.pushService
      .notifyMessageCreated({
        authorUserId: user.sub,
        participantUserIds: participants.map((item) => item.userId),
        payload: {
          type: "message.created",
          chatId: chatID,
          messageId: payload.id,
          title: participants.length <= 2 ? payload.authorName : chat.title,
          body: buildPushPreview(payload),
          url: `/messenger?chatId=${chatID}`,
        },
      })
      .catch(() => {
        void 0;
      });
    return payload;
  }

  async markRead(
    chatID: string,
    messageID: string,
    user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    this.requireLegacyMessageReads();
    const readEvent = await this.withPlaintextChat(chatID, async (manager) => {
      const participantsRepository = manager.getRepository(
        ChatParticipantEntity,
      );
      const messagesRepository = manager.getRepository(MessageEntity);
      const participant = await this.getParticipantOrFail(
        chatID,
        user.sub,
        manager,
      );
      const message = await messagesRepository.findOne({
        where: { id: messageID as MessageEntity["id"], chatId: chatID },
      });
      if (!message) {
        throw new NotFoundException("Message not found");
      }
      if (
        participant.lastReadAt &&
        participant.lastReadAt.getTime() >= message.createdAt.getTime()
      ) {
        return null;
      }
      participant.lastReadAt = message.createdAt;
      participant.lastReadMessageId = message.id;
      await participantsRepository.save(participant);
      await messagesRepository.update(
        {
          chatId: chatID,
          authorId: Not(user.sub),
          createdAt: LessThanOrEqual(message.createdAt),
        },
        { status: MessageStatus.READ },
      );
      const participants = await participantsRepository.find({
        where: { chatId: chatID },
      });
      return { participants, readAt: message.createdAt.toISOString() };
    });
    if (readEvent) {
      this.chatEvents.publishToUsers(
        readEvent.participants.map((item) => item.userId),
        {
          type: "message.read",
          payload: {
            chatID,
            messageID,
            userID: user.sub,
            readAt: readEvent.readAt,
          },
        },
      );
    }
    return { ok: true };
  }

  async updateMessage(
    chatID: string,
    messageID: string,
    dto: UpdateMessageDto,
    user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    const { savedMessage, participants } = await this.withPlaintextChat(
      chatID,
      async (manager, chat) => {
        await this.getParticipantOrFail(chatID, user.sub, manager);
        const message = await this.getOwnMessageOrFail(
          chatID,
          messageID,
          user.sub,
          manager,
        );
        if (message.deletedAt) {
          throw new BadRequestException("Deleted message cannot be edited");
        }
        if (message.kind !== MessageKind.TEXT) {
          throw new BadRequestException("Only text messages can be edited");
        }
        const trimmedText = dto.text.trim();
        if (!trimmedText) {
          throw new BadRequestException("Text message must contain text");
        }
        message.text = trimmedText;
        message.editedAt = new Date();
        const savedMessage = await manager
          .getRepository(MessageEntity)
          .save(message);
        await this.refreshChatMetadata(chatID, manager, chat);
        const participants = await manager
          .getRepository(ChatParticipantEntity)
          .find({
            where: { chatId: chatID },
          });
        return { savedMessage, participants };
      },
    );
    const hydratedMessage = await this.requireHydratedMessage(savedMessage.id);
    const payload = await this.presenter.mapMessage(hydratedMessage);
    this.chatEvents.broadcastToChatParticipants(participants, {
      event: "message.updated",
      data: { chatID, message: payload },
    });
    return payload;
  }

  async deleteMessage(
    chatID: string,
    messageID: string,
    user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    const result = await this.withPlaintextChat(
      chatID,
      async (manager, chat) => {
        await this.getParticipantOrFail(chatID, user.sub, manager);
        const message = await this.getOwnMessageOrFail(
          chatID,
          messageID,
          user.sub,
          manager,
        );
        if (message.deletedAt) {
          return { savedMessage: message, participants: null };
        }
        message.text = "Сообщение удалено";
        message.mediaId = null;
        message.media = null;
        message.deletedAt = new Date();
        const savedMessage = await manager
          .getRepository(MessageEntity)
          .save(message);
        await this.refreshChatMetadata(chatID, manager, chat);
        const participants = await manager
          .getRepository(ChatParticipantEntity)
          .find({
            where: { chatId: chatID },
          });
        return { savedMessage, participants };
      },
    );
    const hydratedMessage = await this.requireHydratedMessage(
      result.savedMessage.id,
    );
    const payload = await this.presenter.mapMessage(hydratedMessage);
    if (result.participants) {
      this.chatEvents.broadcastToChatParticipants(result.participants, {
        event: "message.deleted",
        data: { chatID, message: payload },
      });
    }
    return payload;
  }

  async setTyping(
    chatID: string,
    dto: SetTypingDto,
    user: AuthenticatedUser,
  ): Promise<{
    chatID: string;
    userID: string;
    isTyping: boolean;
    typingParticipants: string[];
  }> {
    await this.getParticipantOrFail(chatID, user.sub);
    const currentUser = await this.usersRepository.findOneBy({
      id: user.sub as UserEntity["id"],
    });
    const participants = await this.participantsRepository.find({
      where: { chatId: chatID },
    });
    const displayName = currentUser?.displayName ?? user.displayName;
    const typingParticipants = this.chatEvents.setTyping(
      chatID,
      user.sub,
      displayName,
      dto.isTyping,
    );

    this.chatEvents.broadcastToChatParticipants(participants, {
      event: dto.isTyping ? "typing.started" : "typing.stopped",
      data: {
        chatID,
        userID: user.sub,
        displayName,
        isTyping: dto.isTyping,
        typingParticipants,
      },
    });

    return {
      chatID,
      userID: user.sub,
      isTyping: dto.isTyping,
      typingParticipants,
    };
  }

  async findExistingDirectChatByUsers(
    firstUserID: string,
    secondUserID: string,
  ): Promise<ChatEntity | null> {
    return this.findExistingDirectChat([firstUserID, secondUserID].sort());
  }

  private async withPlaintextChat<T>(
    chatID: string,
    work: (manager: EntityManager, chat: ChatEntity) => Promise<T>,
  ): Promise<T> {
    if (isE2EERequired()) {
      throw new ForbiddenException(
        "Plaintext messages are disabled; use encrypted-message envelopes",
      );
    }
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Lock the chat before any participant or message row. A policy UPDATE
        // takes this same lock and cannot commit ahead of an older mutation.
        const chat = await manager.getRepository(ChatEntity).findOne({
          where: { id: chatID },
          lock: { mode: "pessimistic_write" },
        });
        if (!chat) {
          throw new NotFoundException("Chat not found");
        }
        if (isE2EERequired() || chat.e2eeRequired) {
          throw new ForbiddenException(
            "Plaintext messages are disabled; use encrypted-message envelopes",
          );
        }
        return work(manager, chat);
      });
    } catch (error) {
      if (error instanceof QueryFailedError) {
        // TypeORM's exception contains SQL parameters, potentially plaintext.
        throw new InternalServerErrorException("Message operation failed");
      }
      throw error;
    }
  }

  private requireLegacyMessageReads(): void {
    if (isE2EERequired() || !isLegacyMessagesReadEnabled()) {
      throw new ForbiddenException(
        "Legacy plaintext message reads are disabled",
      );
    }
  }

  async findExistingDirectChatIDsByUsers(
    ownerUserID: string,
    otherUserIDs: string[],
  ): Promise<Map<string, string>> {
    const uniqueOtherUserIDs = Array.from(
      new Set(otherUserIDs.filter((userID) => userID !== ownerUserID)),
    );
    if (uniqueOtherUserIDs.length === 0) {
      return new Map();
    }

    const candidateRows = await this.participantsRepository
      .createQueryBuilder("owner")
      .select("other.user_id", "otherUserID")
      .addSelect("owner.chat_id", "chatID")
      .innerJoin(
        ChatParticipantEntity,
        "other",
        "other.chat_id = owner.chat_id AND other.user_id IN (:...otherUserIDs)",
        { otherUserIDs: uniqueOtherUserIDs },
      )
      .innerJoin(ChatEntity, "chat", "chat.id = owner.chat_id")
      .where("owner.user_id = :ownerUserID", { ownerUserID })
      .orderBy("chat.last_activity", "DESC")
      .getRawMany<{ otherUserID: string; chatID: string }>();

    const candidateChatIDs = Array.from(
      new Set(candidateRows.map((row) => row.chatID)),
    );
    if (candidateChatIDs.length === 0) {
      return new Map();
    }

    const candidateParticipants = await this.participantsRepository.find({
      where: { chatId: In(candidateChatIDs) },
      select: { chatId: true, userId: true },
    });
    const userIDsByChatID = new Map<string, Set<string>>();
    for (const participant of candidateParticipants) {
      const userIDs = userIDsByChatID.get(participant.chatId) ?? new Set();
      userIDs.add(participant.userId);
      userIDsByChatID.set(participant.chatId, userIDs);
    }

    const chatIDByOtherUserID = new Map<string, string>();
    for (const row of candidateRows) {
      const userIDs = userIDsByChatID.get(row.chatID);
      if (
        userIDs?.size === 2 &&
        userIDs.has(ownerUserID) &&
        userIDs.has(row.otherUserID) &&
        !chatIDByOtherUserID.has(row.otherUserID)
      ) {
        chatIDByOtherUserID.set(row.otherUserID, row.chatID);
      }
    }
    return chatIDByOtherUserID;
  }

  async findOrCreateDirectChat(
    firstUserID: string,
    secondUserID: string,
  ): Promise<ChatSummary> {
    const participantIDs = [firstUserID, secondUserID].sort();
    const existingDirectChat =
      await this.findExistingDirectChat(participantIDs);
    if (existingDirectChat) {
      await this.restoreChatForUser(existingDirectChat.id, firstUserID);
      return this.getChatSummary(existingDirectChat.id, firstUserID);
    }

    const currentUser = await this.usersRepository.findOneBy({
      id: firstUserID as UserEntity["id"],
    });
    const otherUser = await this.usersRepository.findOneBy({
      id: secondUserID as UserEntity["id"],
    });
    if (!currentUser || !otherUser) {
      throw new BadRequestException("User not found");
    }

    return this.createChat(
      {
        title: otherUser.displayName,
        participantIDs: [otherUser.id],
      },
      {
        sub: currentUser.id,
        sid: "internal-contact-flow",
        jti: "internal-contact-flow",
        role: "user",
        sessionVersion: currentUser.sessionVersion,
        deviceUuid: "internal-contact-flow",
        login: currentUser.login ?? currentUser.contact,
        displayName: currentUser.displayName,
        contact: currentUser.contact,
        method: currentUser.method,
        phone: currentUser.phone ?? currentUser.contact,
      },
    );
  }

  private async resolveParticipants(dto: CreateChatDto): Promise<UserEntity[]> {
    const byID = dto.participantIDs?.length
      ? await this.usersRepository.find({
          where: { id: In(dto.participantIDs) },
        })
      : [];

    const byContact = dto.participantContacts?.length
      ? await this.resolveParticipantsByContact(dto.participantContacts)
      : [];

    const uniqueUsers = new Map<string, UserEntity>();
    for (const user of [...byID, ...byContact]) {
      uniqueUsers.set(user.id, user);
    }
    return Array.from(uniqueUsers.values());
  }

  private async resolveParticipantsByContact(
    contacts: string[],
  ): Promise<UserEntity[]> {
    const normalizedContacts = new Set<string>();

    for (const rawContact of contacts) {
      try {
        normalizedContacts.add(normalizeContact(AuthMethod.EMAIL, rawContact));
      } catch {
        // ignore invalid variant
      }
      try {
        normalizedContacts.add(normalizeContact(AuthMethod.PHONE, rawContact));
      } catch {
        // ignore invalid variant
      }
    }

    if (normalizedContacts.size === 0) {
      return [];
    }

    return this.usersRepository.find({
      where: { contact: In(Array.from(normalizedContacts)) },
    });
  }

  private async getParticipantOrFail(
    chatID: string,
    userID: string,
    manager?: EntityManager,
  ): Promise<ChatParticipantEntity> {
    const participant = await (
      manager?.getRepository(ChatParticipantEntity) ??
      this.participantsRepository
    ).findOne({
      where: { chatId: chatID, userId: userID },
      relations: { chat: { lastMessage: true } },
    });
    if (!participant) {
      throw new NotFoundException("Chat not found for current user");
    }
    return participant;
  }

  private async restoreChatForUser(
    chatID: string,
    userID: string,
  ): Promise<boolean> {
    const participant = await this.participantsRepository.findOneBy({
      chatId: chatID,
      userId: userID,
    });
    if (!participant || participant.hiddenAt == null) {
      return false;
    }

    participant.hiddenAt = null;
    await this.participantsRepository.save(participant);
    return true;
  }

  private async getChatSummary(
    chatID: string,
    userID: string,
  ): Promise<ChatSummary> {
    const participant = await this.getParticipantOrFail(chatID, userID);
    return (
      await this.presenter.buildSummary(participant.chat, participant, userID)
    ).summary;
  }

  private async getOwnMessageOrFail(
    chatID: string,
    messageID: string,
    userID: string,
    manager?: EntityManager,
  ): Promise<MessageEntity> {
    const message = await (
      manager?.getRepository(MessageEntity) ?? this.messagesRepository
    ).findOne({
      where: {
        id: messageID as MessageEntity["id"],
        chatId: chatID,
        authorId: userID,
      },
      relations: { author: true, media: true },
    });
    if (!message) {
      throw new NotFoundException("Message not found for current user");
    }
    return message;
  }

  private async requireHydratedMessage(
    messageID: string,
  ): Promise<MessageEntity> {
    const message = await this.messagesRepository.findOne({
      where: { id: messageID as MessageEntity["id"] },
      relations: { author: true, media: true },
    });
    if (!message) {
      throw new NotFoundException("Message not found");
    }
    return message;
  }

  private async refreshChatMetadata(
    chatID: string,
    manager: EntityManager,
    chat: ChatEntity,
  ): Promise<void> {
    const latestMessage = await manager.getRepository(MessageEntity).findOne({
      where: { chatId: chatID },
      order: { createdAt: "DESC" },
    });

    chat.lastActivity = latestMessage?.createdAt ?? chat.lastActivity;
    chat.lastMessageId = latestMessage?.id ?? null;
    await manager.getRepository(ChatEntity).save(chat);
  }

  private async findExistingDirectChat(
    participantIDs: string[],
  ): Promise<ChatEntity | null> {
    if (participantIDs.length !== 2) {
      return null;
    }
    const [firstUserID, secondUserID] = participantIDs;
    if (!firstUserID || !secondUserID) {
      return null;
    }

    const chatIDByOtherUserID = await this.findExistingDirectChatIDsByUsers(
      firstUserID,
      [secondUserID],
    );
    const chatID = chatIDByOtherUserID.get(secondUserID);
    return chatID
      ? this.chatsRepository.findOneBy({
          id: chatID as ChatEntity["id"],
        })
      : null;
  }
}

function buildPushPreview(message: MessageResponse): string {
  if (message.kind === MessageKind.IMAGE) {
    return "Отправил(а) изображение";
  }

  const text = (message.text ?? "").trim() || "Новое сообщение";
  if (text.length <= 110) {
    return text;
  }

  return `${text.slice(0, 107).trimEnd()}...`;
}
