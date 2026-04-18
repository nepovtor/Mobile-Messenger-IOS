import { OnModuleInit } from "@nestjs/common";
import { Repository } from "typeorm";
import { Chat as ChatEntity } from "../../entities/chat.entity";
import { ChatReadState } from "../../entities/chat-read-state.entity";
import { Message as MessageEntity, MessageStatus } from "../../entities/message.entity";
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
export declare class ChatService implements OnModuleInit {
    private readonly chatRepository;
    private readonly chatReadStateRepository;
    private readonly messageRepository;
    private readonly userRepository;
    private readonly chatEventsService;
    private readonly logger;
    private readonly typingTTL;
    private readonly typingParticipants;
    constructor(chatRepository: Repository<ChatEntity>, chatReadStateRepository: Repository<ChatReadState>, messageRepository: Repository<MessageEntity>, userRepository: Repository<User>, chatEventsService: ChatEventsService);
    onModuleInit(): Promise<void>;
    listChats(userID: string): Promise<Chat[]>;
    getChat(chatId: string, userID: string): Promise<Chat>;
    getMessages(chatId: string, userID: string): Promise<Message[]>;
    addMessage(chatId: string, data: SendMessageDto, authorID: string): Promise<Message>;
    createChat(body: CreateChatDto, ownerID: string): Promise<Chat>;
    markChatRead(chatId: string, userID: string, messageID?: string): Promise<Chat>;
    setTyping(chatId: string, userID: string, isTyping: boolean): Promise<Chat>;
    private initializeCommonChat;
    private requireChatAccess;
    private hasAccess;
    private requireUser;
    private toChatDto;
    private toMessageDto;
    private getUnreadCount;
    private getTypingParticipants;
    private pruneTypingParticipants;
    private publishChatUpdated;
}
