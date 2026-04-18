import { MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import { AuthenticatedRequest } from "../../auth.types";
import { ChatEventsService } from "./chat-events.service";
import { ChatService } from "./chat.service";
import { CreateChatDto } from "./dto/create-chat.dto";
import { MarkChatReadDto } from "./dto/mark-chat-read.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { UpdateTypingDto } from "./dto/update-typing.dto";
export declare class ChatController {
    private readonly chatService;
    private readonly chatEventsService;
    constructor(chatService: ChatService, chatEventsService: ChatEventsService);
    listChats(request: AuthenticatedRequest): Promise<import("./chat.service").Chat[]>;
    getChat(chatId: string, request: AuthenticatedRequest): Promise<import("./chat.service").Chat>;
    streamChatEvents(chatId: string, request: AuthenticatedRequest): Promise<Observable<MessageEvent>>;
    getMessages(chatId: string, request: AuthenticatedRequest): Promise<import("./chat.service").Message[]>;
    sendMessage(chatId: string, body: SendMessageDto, request: AuthenticatedRequest): Promise<import("./chat.service").Message>;
    createChat(body: CreateChatDto, request: AuthenticatedRequest): Promise<import("./chat.service").Chat>;
    markChatRead(chatId: string, body: MarkChatReadDto, request: AuthenticatedRequest): Promise<import("./chat.service").Chat>;
    markMessageRead(chatId: string, messageID: string, request: AuthenticatedRequest): Promise<import("./chat.service").Chat>;
    updateTyping(chatId: string, body: UpdateTypingDto, request: AuthenticatedRequest): Promise<import("./chat.service").Chat>;
}
