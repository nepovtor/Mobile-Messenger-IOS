import { AuthenticatedUser } from "../common/authenticated-user";
import { ChatService } from "./chat.service";
import { CreateChatDto } from "./dto/create-chat.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { SetTypingDto } from "./dto/set-typing.dto";
import { UpdateMessageDto } from "./dto/update-message.dto";
export declare class ChatController {
    private readonly chatService;
    constructor(chatService: ChatService);
    createChat(dto: CreateChatDto, user: AuthenticatedUser): Promise<import("./chat.service").ChatSummary>;
    listChats(user: AuthenticatedUser, search?: string): Promise<import("./chat.service").ChatSummary[]>;
    getMessages(chatID: string, user: AuthenticatedUser, limit?: string, before?: string): Promise<import("./chat.service").MessageResponse[]>;
    addMessage(chatID: string, dto: SendMessageDto, user: AuthenticatedUser): Promise<import("./chat.service").MessageResponse>;
    markRead(chatID: string, messageID: string, user: AuthenticatedUser): Promise<{
        ok: true;
    }>;
    updateMessage(chatID: string, messageID: string, dto: UpdateMessageDto, user: AuthenticatedUser): Promise<import("./chat.service").MessageResponse>;
    deleteMessage(chatID: string, messageID: string, user: AuthenticatedUser): Promise<import("./chat.service").MessageResponse>;
    setTyping(chatID: string, dto: SetTypingDto, user: AuthenticatedUser): Promise<{
        chatID: string;
        userID: string;
        isTyping: boolean;
        typingParticipants: string[];
    }>;
}
