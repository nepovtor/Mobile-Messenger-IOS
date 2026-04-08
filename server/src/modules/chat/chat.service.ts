import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Chat as ChatEntity } from "../../entities/chat.entity";
import { ChatReadState } from "../../entities/chat-read-state.entity";
import {
  Message as MessageEntity,
  MessageStatus,
} from "../../entities/message.entity";
import { User } from "../../entities/user.entity";
import { ChatEventsService } from "./chat-events.service";
import { CreateChatDto } from "./dto/create-chat.dto";
import { SendMessageDto } from "./dto/send-message.dto";

export interface Message {
  id: string;
  chatID: string;
  messageID: string;
  text: string;
  authorID: string;
  authorName: string;
  createdAt: string;
  status: MessageStatus;
}

export interface Chat {
  id: string;
  title: string;
  lastMessagePreview?: string | null;
  lastActivity: string;
  unreadCount: number;
  typingParticipants: string[];
}

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly logger = new Logger(ChatService.name);
  private readonly typingTTL = 5_000;
  private readonly typingParticipants = new Map<
    string,
    Map<string, { displayName: string; expiresAt: number }>
  >();

  constructor(
    @InjectRepository(ChatEntity)
    private readonly chatRepository: Repository<ChatEntity>,
    @InjectRepository(ChatReadState)
    private readonly chatReadStateRepository: Repository<ChatReadState>,
    @InjectRepository(MessageEntity)
    private readonly messageRepository: Repository<MessageEntity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly chatEventsService: ChatEventsService,
  ) {}

  async onModuleInit() {
    await this.initializeCommonChat();
  }

  async listChats(userID: string): Promise<Chat[]> {
    const chats = await this.chatRepository.find({
      relations: ["participants"],
      order: { lastActivity: "DESC", createdAt: "DESC" },
    });

    return Promise.all(
      chats
        .filter((chat) => this.hasAccess(chat, userID))
        .map((chat) => this.toChatDto(chat, userID)),
    );
  }

  async getChat(chatId: string, userID: string): Promise<Chat> {
    const normalizedChatID = chatId.toLowerCase();
    const chat = await this.requireChatAccess(normalizedChatID, userID);
    return this.toChatDto(chat, userID);
  }

  async getMessages(chatId: string, userID: string): Promise<Message[]> {
    const normalizedChatID = chatId.toLowerCase();
    await this.requireChatAccess(normalizedChatID, userID);
    const messages = await this.messageRepository.find({
      where: { chat: { id: normalizedChatID } },
      relations: ["author"],
      order: { createdAt: "ASC" },
    });

    return messages.map((message) =>
      this.toMessageDto(message, normalizedChatID),
    );
  }

  async addMessage(
    chatId: string,
    data: SendMessageDto,
    authorID: string,
  ): Promise<Message> {
    const normalizedChatID = chatId.toLowerCase();
    const chat = await this.requireChatAccess(normalizedChatID, authorID);
    const normalizedMessageID = data.messageID.toLowerCase();
    const trimmedText = data.text.trim();

    const existingMessage = await this.messageRepository.findOne({
      where: { messageID: normalizedMessageID },
      relations: ["author", "chat"],
    });
    if (existingMessage) {
      if (
        existingMessage.chat.id !== normalizedChatID ||
        existingMessage.author.id !== authorID
      ) {
        throw new ForbiddenException(
          "Message ID already belongs to another message",
        );
      }
      return this.toMessageDto(existingMessage, normalizedChatID);
    }

    const author = await this.userRepository.findOne({
      where: { id: authorID },
    });
    if (!author) {
      throw new NotFoundException("Author not found");
    }

    const message = this.messageRepository.create({
      messageID: normalizedMessageID,
      text: trimmedText,
      author,
      chat,
      createdAt: new Date(),
      status: "delivered",
    });

    await this.messageRepository.save(message);

    chat.lastMessagePreview = trimmedText.slice(0, 50);
    chat.lastActivity = message.createdAt;
    await this.chatRepository.save(chat);

    const messageDto = this.toMessageDto(message, normalizedChatID);
    this.chatEventsService.publishMessage(normalizedChatID, messageDto);
    await this.publishChatUpdated(chat);
    return messageDto;
  }

  async createChat(body: CreateChatDto, ownerID: string): Promise<Chat> {
    const participantIDs = Array.from(
      new Set([...body.participantIds, ownerID]),
    );
    const participants = await this.userRepository.findBy({
      id: In(participantIDs),
    });

    const chat = this.chatRepository.create({
      title: body.title.trim(),
      participants,
      lastActivity: new Date(),
    });

    const savedChat = await this.chatRepository.save(chat);
    return this.toChatDto(savedChat, ownerID);
  }

  async markChatRead(
    chatId: string,
    userID: string,
    messageID?: string,
  ): Promise<Chat> {
    const normalizedChatID = chatId.toLowerCase();
    const chat = await this.requireChatAccess(normalizedChatID, userID);
    const user = await this.requireUser(userID);
    const targetMessage = messageID
      ? await this.messageRepository.findOne({
          where: {
            messageID: messageID.toLowerCase(),
            chat: { id: normalizedChatID },
          },
          relations: ["author"],
        })
      : await this.messageRepository.findOne({
          where: { chat: { id: normalizedChatID } },
          relations: ["author"],
          order: { createdAt: "DESC" },
        });

    if (messageID && !targetMessage) {
      throw new NotFoundException("Message not found");
    }

    const readAt = targetMessage?.createdAt ?? chat.lastActivity ?? new Date();

    let readState = await this.chatReadStateRepository.findOne({
      where: {
        chat: { id: normalizedChatID },
        user: { id: userID },
      },
      relations: ["chat", "user"],
    });

    if (!readState) {
      readState = this.chatReadStateRepository.create({
        chat,
        user,
        lastReadAt: readAt,
        lastReadMessageID: targetMessage?.messageID ?? null,
      });
    } else {
      const nextReadAt =
        readState.lastReadAt && readState.lastReadAt > readAt
          ? readState.lastReadAt
          : readAt;
      readState.lastReadAt = nextReadAt;
      readState.lastReadMessageID =
        targetMessage?.messageID ?? readState.lastReadMessageID;
    }

    await this.chatReadStateRepository.save(readState);

    const messagesToMarkRead = await this.messageRepository.find({
      where: { chat: { id: normalizedChatID } },
      relations: ["author"],
      order: { createdAt: "ASC" },
    });

    const updatedMessages = messagesToMarkRead.filter(
      (message) =>
        message.author.id !== userID &&
        message.createdAt <= readAt &&
        message.status !== "read",
    );

    if (updatedMessages.length > 0) {
      for (const message of updatedMessages) {
        message.status = "read";
      }
      await this.messageRepository.save(updatedMessages);
    }

    const chatDto = await this.toChatDto(chat, userID);
    await this.publishChatUpdated(chat);
    return chatDto;
  }

  async setTyping(
    chatId: string,
    userID: string,
    isTyping: boolean,
  ): Promise<Chat> {
    const normalizedChatID = chatId.toLowerCase();
    const chat = await this.requireChatAccess(normalizedChatID, userID);
    const user = await this.requireUser(userID);

    this.pruneTypingParticipants(normalizedChatID);
    const chatTypingParticipants =
      this.typingParticipants.get(normalizedChatID) ?? new Map();

    if (isTyping) {
      chatTypingParticipants.set(userID, {
        displayName: user.displayName,
        expiresAt: Date.now() + this.typingTTL,
      });
      this.typingParticipants.set(normalizedChatID, chatTypingParticipants);
    } else {
      chatTypingParticipants.delete(userID);
      if (chatTypingParticipants.size === 0) {
        this.typingParticipants.delete(normalizedChatID);
      } else {
        this.typingParticipants.set(normalizedChatID, chatTypingParticipants);
      }
    }

    const chatDto = await this.toChatDto(chat, userID);
    await this.publishChatUpdated(chat);
    return chatDto;
  }

  private async initializeCommonChat() {
    const existing = await this.chatRepository.findOne({
      where: { title: "General Chat" },
    });

    if (existing) {
      return;
    }

    const chat = this.chatRepository.create({
      title: "General Chat",
      lastActivity: new Date(),
      participants: [],
    });
    await this.chatRepository.save(chat);
    this.logger.log("Seeded General Chat");
  }

  private async requireChatAccess(
    chatId: string,
    userID: string,
  ): Promise<ChatEntity> {
    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
      relations: ["participants"],
    });
    if (!chat) {
      throw new NotFoundException("Chat not found");
    }
    if (!this.hasAccess(chat, userID)) {
      throw new ForbiddenException("Access denied");
    }
    return chat;
  }

  private hasAccess(chat: ChatEntity, userID: string): boolean {
    return (
      chat.participants.length === 0 ||
      chat.participants.some((user) => user.id === userID)
    );
  }

  private async requireUser(userID: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userID },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  private async toChatDto(chat: ChatEntity, userID: string): Promise<Chat> {
    const unreadCount = await this.getUnreadCount(chat.id, userID);
    return {
      id: chat.id,
      title: chat.title,
      lastMessagePreview: chat.lastMessagePreview,
      lastActivity: (chat.lastActivity ?? chat.createdAt).toISOString(),
      unreadCount,
      typingParticipants: this.getTypingParticipants(chat.id, userID),
    };
  }

  private toMessageDto(message: MessageEntity, chatId: string): Message {
    return {
      id: message.id,
      chatID: chatId,
      messageID: message.messageID,
      text: message.text,
      authorID: message.author.id,
      authorName: message.author.displayName,
      createdAt: message.createdAt.toISOString(),
      status: message.status,
    };
  }

  private async getUnreadCount(
    chatID: string,
    userID: string,
  ): Promise<number> {
    const readState = await this.chatReadStateRepository.findOne({
      where: {
        chat: { id: chatID },
        user: { id: userID },
      },
    });

    const query = this.messageRepository
      .createQueryBuilder("message")
      .innerJoin("message.author", "author")
      .innerJoin("message.chat", "chat")
      .where("chat.id = :chatID", { chatID })
      .andWhere("author.id != :userID", { userID });

    if (readState?.lastReadAt) {
      query.andWhere("message.createdAt > :lastReadAt", {
        lastReadAt: readState.lastReadAt,
      });
    }

    return query.getCount();
  }

  private getTypingParticipants(chatID: string, userID: string): string[] {
    this.pruneTypingParticipants(chatID);
    const chatTypingParticipants = this.typingParticipants.get(chatID);
    if (!chatTypingParticipants) {
      return [];
    }

    return Array.from(chatTypingParticipants.entries())
      .filter(([participantUserID]) => participantUserID !== userID)
      .map(([, participant]) => participant.displayName)
      .sort((left, right) => left.localeCompare(right));
  }

  private pruneTypingParticipants(chatID?: string) {
    const now = Date.now();
    const chatIDs = chatID
      ? [chatID]
      : Array.from(this.typingParticipants.keys());

    for (const currentChatID of chatIDs) {
      const participants = this.typingParticipants.get(currentChatID);
      if (!participants) {
        continue;
      }

      for (const [participantUserID, participant] of participants.entries()) {
        if (participant.expiresAt <= now) {
          participants.delete(participantUserID);
        }
      }

      if (participants.size === 0) {
        this.typingParticipants.delete(currentChatID);
      } else {
        this.typingParticipants.set(currentChatID, participants);
      }
    }
  }

  private async publishChatUpdated(chat: ChatEntity) {
    await this.chatEventsService.publishChatUpdated(chat.id, (userID) =>
      this.toChatDto(chat, userID),
    );
  }
}
