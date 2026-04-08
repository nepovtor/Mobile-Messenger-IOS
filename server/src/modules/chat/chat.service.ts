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
import {
  Message as MessageEntity,
  MessageStatus,
} from "../../entities/message.entity";
import { User } from "../../entities/user.entity";
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
}

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatEntity)
    private readonly chatRepository: Repository<ChatEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepository: Repository<MessageEntity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    await this.initializeCommonChat();
  }

  async listChats(userID: string): Promise<Chat[]> {
    const chats = await this.chatRepository.find({
      relations: ["participants"],
      order: { lastActivity: "DESC", createdAt: "DESC" },
    });

    return chats
      .filter((chat) => this.hasAccess(chat, userID))
      .map((chat) => this.toChatDto(chat));
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

    const author = await this.userRepository.findOne({
      where: { id: authorID },
    });
    if (!author) {
      throw new NotFoundException("Author not found");
    }

    const message = this.messageRepository.create({
      messageID: data.messageID.toLowerCase(),
      text: data.text.trim(),
      author,
      chat,
      createdAt: new Date(),
      status: "delivered",
    });

    await this.messageRepository.save(message);

    chat.lastMessagePreview = data.text.trim().slice(0, 50);
    chat.lastActivity = message.createdAt;
    await this.chatRepository.save(chat);

    return this.toMessageDto(message, normalizedChatID);
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
    return this.toChatDto(savedChat);
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

  private toChatDto(chat: ChatEntity): Chat {
    return {
      id: chat.id,
      title: chat.title,
      lastMessagePreview: chat.lastMessagePreview,
      lastActivity: (chat.lastActivity ?? chat.createdAt).toISOString(),
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
}
