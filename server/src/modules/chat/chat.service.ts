import {
  BadRequestException,
  Injectable,
  NotFoundException,
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
    const participants = await this.participantsRepository.find({
      where: { userId: userID },
      relations: { chat: { lastMessage: true } },
      order: { chat: { lastActivity: "DESC" } },
    });

    const visibleParticipants = participants.filter(
      (participant) => participant.hiddenAt == null,
    );

    const summaries = await Promise.all(
      visibleParticipants.map((participant) =>
        this.presenter.buildSummary(participant.chat, participant, userID),
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
    const participant = await this.getParticipantOrFail(chatID, user.sub);
    const participants = await this.participantsRepository.find({
      where: { chatId: chatID },
    });
    const restoredParticipantIDs = participants
      .filter((item) => item.hiddenAt != null)
      .map((item) => item.userId);

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
      return this.presenter.mapMessage(existingMessage);
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

    await this.participantsRepository.save(participants);

    const chat = await this.chatsRepository.findOneBy({
      id: chatID as ChatEntity["id"],
    });
    if (!chat) {
      throw new NotFoundException("Chat not found");
    }
    chat.lastMessageId = message.id;
    chat.lastActivity = message.createdAt;
    await this.chatsRepository.save(chat);

    const hydratedMessage = await this.messagesRepository.findOne({
      where: { id: message.id },
      relations: { author: true, media: true },
    });
    if (!hydratedMessage) {
      throw new NotFoundException("Message not found after save");
    }

    for (const restoredUserID of restoredParticipantIDs) {
      const summary = await this.getChatSummary(chatID, restoredUserID);
      this.chatEvents.publishToUsers([restoredUserID], {
        type: "chat.created",
        payload: {
          chatID,
          chat: summary,
        },
      });
    }

    const payload = await this.presenter.mapMessage(hydratedMessage);
    this.chatEvents.broadcastToChatParticipants(participants, {
      event: "message.created",
      data: {
        chatID,
        message: payload,
      },
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
    this.chatEvents.publishToUsers(
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

  async updateMessage(
    chatID: string,
    messageID: string,
    dto: UpdateMessageDto,
    user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    await this.getParticipantOrFail(chatID, user.sub);
    const message = await this.getOwnMessageOrFail(chatID, messageID, user.sub);

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
    const savedMessage = await this.messagesRepository.save(message);
    await this.refreshChatMetadata(chatID);

    const participants = await this.participantsRepository.find({
      where: { chatId: chatID },
    });
    const hydratedMessage = await this.requireHydratedMessage(savedMessage.id);
    const payload = await this.presenter.mapMessage(hydratedMessage);
    this.chatEvents.broadcastToChatParticipants(participants, {
      event: "message.updated",
      data: {
        chatID,
        message: payload,
      },
    });
    return payload;
  }

  async deleteMessage(
    chatID: string,
    messageID: string,
    user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    await this.getParticipantOrFail(chatID, user.sub);
    const message = await this.getOwnMessageOrFail(chatID, messageID, user.sub);

    if (message.deletedAt) {
      return this.presenter.mapMessage(
        await this.requireHydratedMessage(message.id),
      );
    }

    message.text = "Сообщение удалено";
    message.mediaId = null;
    message.media = null;
    message.deletedAt = new Date();
    const savedMessage = await this.messagesRepository.save(message);
    await this.refreshChatMetadata(chatID);

    const participants = await this.participantsRepository.find({
      where: { chatId: chatID },
    });
    const hydratedMessage = await this.requireHydratedMessage(savedMessage.id);
    const payload = await this.presenter.mapMessage(hydratedMessage);
    this.chatEvents.broadcastToChatParticipants(participants, {
      event: "message.deleted",
      data: {
        chatID,
        message: payload,
      },
    });
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
  ): Promise<MessageEntity> {
    const message = await this.messagesRepository.findOne({
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

  private async refreshChatMetadata(chatID: string): Promise<void> {
    const chat = await this.chatsRepository.findOneBy({
      id: chatID as ChatEntity["id"],
    });
    if (!chat) {
      throw new NotFoundException("Chat not found");
    }

    const latestMessage = await this.messagesRepository.findOne({
      where: { chatId: chatID },
      order: { createdAt: "DESC" },
    });

    chat.lastActivity = latestMessage?.createdAt ?? chat.lastActivity;
    chat.lastMessageId = latestMessage?.id ?? null;
    await this.chatsRepository.save(chat);
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
