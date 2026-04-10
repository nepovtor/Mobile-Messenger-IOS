import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, LessThanOrEqual, Not, Repository } from "typeorm";
import { ChatEntity } from "../../entities/chat.entity";
import { ChatParticipantEntity } from "../../entities/chat-participant.entity";
import { MessageEntity, MessageStatus } from "../../entities/message.entity";
import { AuthMethod, UserEntity } from "../../entities/user.entity";
import { AuthenticatedUser } from "../common/authenticated-user";
import { normalizeContact } from "../common/contact.utils";
import { RealtimeService } from "../realtime/realtime.service";
import { CreateChatDto } from "./dto/create-chat.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { SetTypingDto } from "./dto/set-typing.dto";

export interface ChatSummary {
  id: string;
  title: string;
  lastMessagePreview: string | null;
  lastActivity: Date;
  unreadCount: number;
  typingParticipants: string[];
}

export interface MessageResponse {
  id: string;
  messageID: string;
  chatID: string;
  authorID: string;
  authorName: string;
  text: string;
  status: MessageStatus;
  createdAt: Date;
}

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatEntity)
    private readonly chatsRepository: Repository<ChatEntity>,
    @InjectRepository(ChatParticipantEntity)
    private readonly participantsRepository: Repository<ChatParticipantEntity>,
    @InjectRepository(MessageEntity)
    private readonly messagesRepository: Repository<MessageEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly realtimeService: RealtimeService,
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

    if (participantIDs.size < 2) {
      throw new BadRequestException("A chat must include at least two users");
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

  async listChats(userID: string): Promise<ChatSummary[]> {
    const participants = await this.participantsRepository.find({
      where: { userId: userID },
      relations: { chat: true },
      order: { chat: { lastActivity: "DESC" } },
    });

    const summaries = await Promise.all(
      participants.map((participant) =>
        this.buildChatSummary(participant.chat, participant, userID),
      ),
    );
    return summaries.sort(
      (left, right) =>
        right.lastActivity.getTime() - left.lastActivity.getTime(),
    );
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
      relations: { author: true },
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
    const participant = await this.getParticipantOrFail(chatID, user.sub);
    const participants = await this.participantsRepository.find({
      where: { chatId: chatID },
    });

    const trimmedText = dto.text.trim();
    if (!trimmedText) {
      throw new BadRequestException("Message text is required");
    }

    const message = await this.messagesRepository.save(
      this.messagesRepository.create({
        chatId: chatID,
        authorId: user.sub,
        clientMessageId: dto.messageID,
        text: trimmedText,
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
    chat.lastMessagePreview = trimmedText;
    chat.lastActivity = message.createdAt;
    await this.chatsRepository.save(chat);

    const hydratedMessage = await this.messagesRepository.findOne({
      where: { id: message.id },
      relations: { author: true },
    });
    if (!hydratedMessage) {
      throw new NotFoundException("Message not found after save");
    }

    const payload = await this.mapMessage(hydratedMessage);
    this.realtimeService.publishToUsers(
      participants.map((item) => item.userId),
      {
        type: "message.created",
        payload: {
          chatID,
          message: payload,
        },
      },
    );
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
  ): Promise<{ typingParticipants: string[] }> {
    await this.getParticipantOrFail(chatID, user.sub);
    const participants = await this.participantsRepository.find({
      where: { chatId: chatID },
    });
    const typingParticipants = this.realtimeService.setTyping(
      chatID,
      user.sub,
      user.displayName,
      dto.isTyping,
    );

    this.realtimeService.publishToUsers(
      participants.map((item) => item.userId),
      {
        type: "typing.changed",
        payload: {
          chatID,
          userID: user.sub,
          displayName: user.displayName,
          isTyping: dto.isTyping,
          typingParticipants,
        },
      },
    );

    return {
      typingParticipants,
    };
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
    return this.buildChatSummary(participant.chat, participant, userID);
  }

  private async buildChatSummary(
    chat: ChatEntity,
    participant: ChatParticipantEntity,
    userID: string,
  ): Promise<ChatSummary> {
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
    return {
      id: chat.id,
      title: chat.title,
      lastMessagePreview: chat.lastMessagePreview,
      lastActivity: chat.lastActivity,
      unreadCount,
      typingParticipants: this.realtimeService.getTypingParticipants(
        chat.id,
        userID,
      ),
    };
  }

  private async mapMessage(message: MessageEntity): Promise<MessageResponse> {
    return {
      id: message.id,
      messageID: message.clientMessageId,
      chatID: message.chatId,
      authorID: message.authorId,
      authorName: message.author.displayName,
      text: message.text,
      status: message.status,
      createdAt: message.createdAt,
    };
  }
}
