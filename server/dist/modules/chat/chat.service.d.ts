import { Repository } from "typeorm";
import { ChatEntity } from "../../entities/chat.entity";
import { ChatParticipantEntity } from "../../entities/chat-participant.entity";
import { MediaEntity } from "../../entities/media.entity";
import { MessageEntity, MessageKind, MessageStatus } from "../../entities/message.entity";
import { UserEntity } from "../../entities/user.entity";
import { AuthenticatedUser } from "../common/authenticated-user";
import { MediaService } from "../media/media.service";
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
export declare class ChatService {
    private readonly chatsRepository;
    private readonly participantsRepository;
    private readonly messagesRepository;
    private readonly usersRepository;
    private readonly mediaRepository;
    private readonly realtimeService;
    private readonly mediaService;
    constructor(chatsRepository: Repository<ChatEntity>, participantsRepository: Repository<ChatParticipantEntity>, messagesRepository: Repository<MessageEntity>, usersRepository: Repository<UserEntity>, mediaRepository: Repository<MediaEntity>, realtimeService: RealtimeService, mediaService: MediaService);
    createChat(dto: CreateChatDto, user: AuthenticatedUser): Promise<ChatSummary>;
    listChats(userID: string, search?: string): Promise<ChatSummary[]>;
    getMessages(chatID: string, userID: string, limit?: number, before?: string): Promise<MessageResponse[]>;
    addMessage(chatID: string, dto: SendMessageDto, user: AuthenticatedUser): Promise<MessageResponse>;
    markRead(chatID: string, messageID: string, user: AuthenticatedUser): Promise<{
        ok: true;
    }>;
    setTyping(chatID: string, dto: SetTypingDto, user: AuthenticatedUser): Promise<{
        typingParticipants: string[];
    }>;
    private resolveParticipants;
    private resolveParticipantsByContact;
    private getParticipantOrFail;
    private getChatSummary;
    private buildChatSummaryEnvelope;
    private mapMessage;
    private findExistingDirectChat;
}
