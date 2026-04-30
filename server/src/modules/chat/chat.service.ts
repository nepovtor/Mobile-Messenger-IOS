import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, LessThanOrEqual, Not, Repository } from "typeorm";
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
import { isDemoChatSeedingEnabled } from "../common/runtime-config";
import { MediaService } from "../media/media.service";
import { RealtimeService } from "../realtime/realtime.service";
import { CreateChatDto } from "./dto/create-chat.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { SetTypingDto } from "./dto/set-typing.dto";

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
}

interface RealtimeSendMessageDto {
  clientMessageId: string;
  kind: MessageKind;
  text?: string;
  mediaID?: string;
}

@Injectable()
export class ChatService implements OnModuleInit {
  constructor(
    @InjectRepository(ChatEntity)
    private readonly chatsRepository: Repository<ChatEntity>,
    @InjectRepository(ChatParticipantEntity)
    private readonly participantsRepository: Repository<ChatParticipantEntity>,
    @InjectRepository(MessageEntity)
    private readonly messagesRepository: Repository<MessageEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(MediaEntity)
    private readonly mediaRepository: Repository<MediaEntity>,
    private readonly realtimeService: RealtimeService,
    private readonly mediaService: MediaService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isDemoChatSeedingEnabled()) {
      return;
    }
    await this.seedDemoChats();
  }

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
        return this.getChatSummary(existingDirectChat.id, user.sub);
      }
    }

    const chat = await this.chatsRepository.save(
      this.chatsRepository.create({
        title,
        lastMessagePreview: null,
        lastActivity: new Date(),
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
    this.realtimeService.publishToUsers(Array.from(participantIDs), {
      type: "chat.created",
      payload: createdPayload,
    });
    return summary;
  }

  async listChats(userID: string, search?: string): Promise<ChatSummary[]> {
    const participants = await this.participantsRepository.find({
      where: { userId: userID },
      relations: { chat: true },
      order: { chat: { lastActivity: "DESC" } },
    });

    const summaries = await Promise.all(
      participants.map((participant) =>
        this.buildChatSummaryEnvelope(participant.chat, participant, userID),
      ),
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

  async getMessages(
    chatID: string,
    userID: string,
    limit = 100,
    before?: string,
  ): Promise<MessageResponse[]> {
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

    const messages = await this.messagesRepository.find({
      where: {
        chatId: chatID,
        ...(createdBefore ? { createdAt: LessThanOrEqual(createdBefore) } : {}),
      },
      relations: { author: true, media: true },
      order: { createdAt: "DESC" },
      take: Math.min(Math.max(limit, 1), 200),
    });

    const filteredMessages = before
      ? messages.filter((message) => message.id !== before)
      : messages;

    const ascending = filteredMessages.reverse();
    return Promise.all(ascending.map((message) => this.mapMessage(message)));
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
    const participant = await this.getParticipantOrFail(chatID, user.sub);
    const participants = await this.participantsRepository.find({
      where: { chatId: chatID },
    });

    const trimmedText = dto.text?.trim();
    let media: MediaEntity | null = null;

    const existingMessage = await this.messagesRepository.findOne({
      where: {
        chatId: chatID,
        authorId: user.sub,
        clientMessageId: dto.clientMessageId,
      },
      relations: { author: true, media: true },
    });
    if (existingMessage) {
      return this.mapMessage(existingMessage);
    }

    if (dto.kind === MessageKind.TEXT) {
      if (!trimmedText) {
        throw new BadRequestException("Text message must contain text");
      }
    } else if (dto.kind === MessageKind.IMAGE) {
      if (!dto.mediaID) {
        throw new BadRequestException("Image message must contain mediaID");
      }
      media = await this.mediaService.getUploadedMediaOrFail(dto.mediaID);
      if (media.uploadedById !== user.sub) {
        throw new BadRequestException("Media belongs to another user");
      }
    } else {
      throw new BadRequestException("Unsupported message kind");
    }

    const message = await this.messagesRepository.save(
      this.messagesRepository.create({
        chatId: chatID,
        authorId: user.sub,
        clientMessageId: dto.clientMessageId,
        kind: dto.kind,
        text:
          dto.kind === MessageKind.TEXT
            ? trimmedText || null
            : trimmedText || null,
        mediaId: media?.id ?? null,
        status:
          participants.length > 1
            ? MessageStatus.DELIVERED
            : MessageStatus.SENT,
      }),
    );

    participant.lastReadAt = message.createdAt;
    participant.lastReadMessageId = message.id;
    await this.participantsRepository.save(participant);

    const chat = await this.chatsRepository.findOneBy({
      id: chatID as ChatEntity["id"],
    });
    if (!chat) {
      throw new NotFoundException("Chat not found");
    }
    chat.lastMessagePreview =
      dto.kind === MessageKind.IMAGE ? "Фото" : trimmedText || null;
    chat.lastActivity = message.createdAt;
    await this.chatsRepository.save(chat);

    const hydratedMessage = await this.messagesRepository.findOne({
      where: { id: message.id },
      relations: { author: true, media: true },
    });
    if (!hydratedMessage) {
      throw new NotFoundException("Message not found after save");
    }

    const payload = await this.mapMessage(hydratedMessage);
    this.realtimeService.broadcastToChatParticipants(participants, {
      event: "message.created",
      data: {
        chatID,
        message: payload,
      },
    });
    return payload;
  }

  async markRead(
    chatID: string,
    messageID: string,
    user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    const participant = await this.getParticipantOrFail(chatID, user.sub);
    const message = await this.messagesRepository.findOne({
      where: { id: messageID as MessageEntity["id"], chatId: chatID },
    });
    if (!message) {
      throw new NotFoundException("Message not found");
    }

    participant.lastReadAt = message.createdAt;
    participant.lastReadMessageId = message.id;
    await this.participantsRepository.save(participant);

    await this.messagesRepository.update(
      {
        chatId: chatID,
        authorId: Not(user.sub),
        createdAt: LessThanOrEqual(message.createdAt),
      },
      {
        status: MessageStatus.READ,
      },
    );

    const participants = await this.participantsRepository.find({
      where: { chatId: chatID },
    });
    this.realtimeService.publishToUsers(
      participants.map((item) => item.userId),
      {
        type: "message.read",
        payload: {
          chatID,
          messageID,
          userID: user.sub,
          readAt: message.createdAt.toISOString(),
        },
      },
    );

    return { ok: true };
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
    const typingParticipants = this.realtimeService.setTyping(
      chatID,
      user.sub,
      displayName,
      dto.isTyping,
    );

    this.realtimeService.broadcastToChatParticipants(participants, {
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

  async findOrCreateDirectChat(
    firstUserID: string,
    secondUserID: string,
  ): Promise<ChatSummary> {
    const participantIDs = [firstUserID, secondUserID].sort();
    const existingDirectChat = await this.findExistingDirectChat(participantIDs);
    if (existingDirectChat) {
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
    const allUsers = await this.usersRepository.find();
    const result = new Map<string, UserEntity>();

    for (const rawContact of contacts) {
      const normalizedVariants = new Set<string>();
      try {
        normalizedVariants.add(normalizeContact(AuthMethod.EMAIL, rawContact));
      } catch {
        // ignore invalid variant
      }
      try {
        normalizedVariants.add(normalizeContact(AuthMethod.PHONE, rawContact));
      } catch {
        // ignore invalid variant
      }

      const match = allUsers.find((candidate) =>
        normalizedVariants.has(candidate.contact),
      );
      if (match) {
        result.set(match.id, match);
      }
    }

    return Array.from(result.values());
  }

  private async getParticipantOrFail(
    chatID: string,
    userID: string,
  ): Promise<ChatParticipantEntity> {
    const participant = await this.participantsRepository.findOne({
      where: { chatId: chatID, userId: userID },
      relations: { chat: true },
    });
    if (!participant) {
      throw new NotFoundException("Chat not found for current user");
    }
    return participant;
  }

  private async getChatSummary(
    chatID: string,
    userID: string,
  ): Promise<ChatSummary> {
    const participant = await this.getParticipantOrFail(chatID, userID);
    return (
      await this.buildChatSummaryEnvelope(participant.chat, participant, userID)
    ).summary;
  }

  private async buildChatSummaryEnvelope(
    chat: ChatEntity,
    participant: ChatParticipantEntity,
    userID: string,
  ): Promise<{ summary: ChatSummary; dedupeKey: string }> {
    const participants = await this.participantsRepository.find({
      where: { chatId: chat.id },
      relations: { user: true },
    });
    const unreadQuery = this.messagesRepository
      .createQueryBuilder("message")
      .where("message.chat_id = :chatID", { chatID: chat.id })
      .andWhere("message.author_id != :userID", { userID });

    if (participant.lastReadAt) {
      unreadQuery.andWhere("message.created_at > :lastReadAt", {
        lastReadAt: participant.lastReadAt,
      });
    }

    const unreadCount = await unreadQuery.getCount();
    const otherParticipants = participants.filter(
      (item) => item.userId !== userID,
    );
    return {
      summary: {
        id: chat.id,
        title: chat.title,
        lastMessagePreview: chat.lastMessagePreview,
        lastActivity: chat.lastActivity,
        unreadCount,
        typingParticipants: this.realtimeService.getTypingParticipants(
          chat.id,
          userID,
        ),
        participantNames: otherParticipants.map(
          (item) => item.user.displayName,
        ),
        participantCount: participants.length,
      },
      dedupeKey:
        participants.length === 2
          ? `direct:${otherParticipants
              .map((item) => item.userId)
              .sort()
              .join(":")}`
          : `chat:${chat.id}`,
    };
  }

  private async mapMessage(message: MessageEntity): Promise<MessageResponse> {
    return {
      id: message.id,
      messageID: message.clientMessageId,
      chatID: message.chatId,
      authorID: message.authorId,
      authorName: message.author.displayName,
      kind: message.kind,
      text: message.text,
      mediaID: message.mediaId,
      mediaURL: await this.mediaService.buildDownloadUrl(message.media),
      status: message.status,
      createdAt: message.createdAt,
    };
  }

  private async findExistingDirectChat(
    participantIDs: string[],
  ): Promise<ChatEntity | null> {
    if (participantIDs.length !== 2) {
      return null;
    }

    const candidateParticipants = await this.participantsRepository.find({
      where: {
        userId: In(participantIDs),
      },
      relations: {
        chat: true,
      },
    });

    const candidateChatIDs = Array.from(
      candidateParticipants.reduce((result, participant) => {
        const chatParticipants =
          result.get(participant.chatId) ?? new Set<string>();
        chatParticipants.add(participant.userId);
        result.set(participant.chatId, chatParticipants);
        return result;
      }, new Map<string, Set<string>>()),
    )
      .filter(([, userIDs]) => userIDs.size === participantIDs.length)
      .map(([chatID]) => chatID);

    if (candidateChatIDs.length === 0) {
      return null;
    }

    const fullParticipants = await this.participantsRepository.find({
      where: {
        chatId: In(candidateChatIDs),
      },
      relations: {
        chat: true,
      },
    });

    const normalizedParticipantsKey = participantIDs.slice().sort().join(":");
    const matchedChats = Array.from(
      fullParticipants.reduce((result, participant) => {
        const entry = result.get(participant.chatId) ?? {
          userIDs: [] as string[],
          chat: participant.chat,
        };
        entry.userIDs.push(participant.userId);
        result.set(participant.chatId, entry);
        return result;
      }, new Map<string, { userIDs: string[]; chat: ChatEntity }>()),
    )
      .filter(([, entry]) => {
        const key = entry.userIDs.slice().sort().join(":");
        return (
          entry.userIDs.length === participantIDs.length &&
          key === normalizedParticipantsKey
        );
      })
      .map(([, entry]) => entry.chat)
      .sort(
        (left, right) =>
          right.lastActivity.getTime() - left.lastActivity.getTime(),
      );

    return matchedChats[0] ?? null;
  }

  private async seedDemoChats(): Promise<void> {
    const demoUsers = new Map<string, UserEntity>();
    for (const account of [
      ["+15551230011", "Анна Demo"],
      ["+15551230012", "Борис Demo"],
      ["+15551230013", "Вера Demo"],
      ["+15551230014", "Глеб Demo"],
      ["+15551230015", "Даша Demo"],
    ] as const) {
      const [contact, displayName] = account;
      let user = await this.usersRepository.findOne({
        where: { contact },
      });
      if (!user) {
        user = await this.usersRepository.save(
          this.usersRepository.create({
            method: AuthMethod.PHONE,
            contact,
            phone: contact,
            displayName,
          }),
        );
      }
      demoUsers.set(contact, user);
    }

    const seeds = [
      {
        id: "10000000-0000-0000-0000-000000000001",
        title: "Анна и Борис",
        participants: ["+15551230011", "+15551230012"],
        messages: [
          {
            id: "20000000-0000-0000-0000-000000000001",
            author: "+15551230011",
            text: "Привет, Борис!",
          },
        ],
      },
      {
        id: "10000000-0000-0000-0000-000000000002",
        title: "Анна и Вера",
        participants: ["+15551230011", "+15551230013"],
        messages: [
          {
            id: "20000000-0000-0000-0000-000000000002",
            author: "+15551230013",
            text: "Я собрала идеи для фото.",
          },
        ],
      },
      {
        id: "10000000-0000-0000-0000-000000000003",
        title: "Борис и Глеб",
        participants: ["+15551230012", "+15551230014"],
        messages: [
          {
            id: "20000000-0000-0000-0000-000000000003",
            author: "+15551230014",
            text: "Соберу билд сегодня вечером.",
          },
        ],
      },
      {
        id: "10000000-0000-0000-0000-000000000004",
        title: "Demo Team",
        participants: [
          "+15551230011",
          "+15551230012",
          "+15551230014",
          "+15551230015",
        ],
        messages: [
          {
            id: "20000000-0000-0000-0000-000000000004",
            author: "+15551230015",
            text: "Проверила demo flow перед ревью.",
          },
        ],
      },
    ];

    for (const seed of seeds) {
      let chat: ChatEntity | null = await this.chatsRepository.findOneBy({
        id: seed.id as ChatEntity["id"],
      });

      if (!chat) {
        const seededChat = this.chatsRepository.create({
          id: seed.id as ChatEntity["id"],
          title: seed.title,
          lastActivity: new Date("2026-04-24T12:00:00.000Z"),
          lastMessagePreview: null,
        });
        chat = await this.chatsRepository.save(seededChat);
      }

      if (!chat) {
        continue;
      }

      const existingParticipants = await this.participantsRepository.find({
        where: { chatId: chat.id },
      });
      if (existingParticipants.length === 0) {
        await this.participantsRepository.save(
          seed.participants.map((contact) => {
            const user = demoUsers.get(contact);
            if (!user) {
              throw new Error(`Missing demo user ${contact}`);
            }
            return this.participantsRepository.create({
              chatId: chat.id,
              userId: user.id,
              lastReadAt: null,
              lastReadMessageId: null,
            });
          }),
        );
      }

      for (const seedMessage of seed.messages) {
        const exists = await this.messagesRepository.findOneBy({
          id: seedMessage.id as MessageEntity["id"],
        });
        if (exists) {
          continue;
        }

        const author = demoUsers.get(seedMessage.author);
        if (!author) {
          continue;
        }

        const seededMessage = this.messagesRepository.create({
          id: seedMessage.id as MessageEntity["id"],
          chatId: chat.id,
          authorId: author.id,
          clientMessageId: seedMessage.id as MessageEntity["clientMessageId"],
          kind: MessageKind.TEXT,
          text: seedMessage.text,
          mediaId: null,
          status: MessageStatus.READ,
        });
        await this.messagesRepository.save(seededMessage);

        chat.lastMessagePreview = seedMessage.text;
        chat.lastActivity = new Date("2026-04-24T12:00:00.000Z");
        await this.chatsRepository.save(chat);
      }
    }
  }
}
