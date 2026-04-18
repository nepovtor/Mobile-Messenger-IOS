import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Req,
  Sse,
  UseGuards,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { AuthenticatedRequest } from "../../auth.types";
import { JwtAuthGuard } from "../../jwt-auth.guard";
import { ChatEventsService } from "./chat-events.service";
import { ChatService } from "./chat.service";
import { CreateChatDto } from "./dto/create-chat.dto";
import { MarkChatReadDto } from "./dto/mark-chat-read.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { UpdateTypingDto } from "./dto/update-typing.dto";

@Controller("chats")
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatEventsService: ChatEventsService,
  ) {}

  @Get()
  listChats(@Req() request: AuthenticatedRequest) {
    return this.chatService.listChats(request.user.sub);
  }

  @Get(":chatId")
  getChat(
    @Param("chatId") chatId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.chatService.getChat(chatId, request.user.sub);
  }

  @Sse(":chatId/events")
  async streamChatEvents(
    @Param("chatId") chatId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<Observable<MessageEvent>> {
    const chat = await this.chatService.getChat(chatId, request.user.sub);
    return this.chatEventsService.subscribe(
      chatId.toLowerCase(),
      request.user.sub,
      chat,
    );
  }

  @Get(":chatId/messages")
  getMessages(
    @Param("chatId") chatId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.chatService.getMessages(chatId, request.user.sub);
  }

  @Post(":chatId/messages")
  sendMessage(
    @Param("chatId") chatId: string,
    @Body() body: SendMessageDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.chatService.addMessage(chatId, body, request.user.sub);
  }

  @Post()
  createChat(
    @Body() body: CreateChatDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.chatService.createChat(body, request.user.sub);
  }

  @Post(":chatId/read")
  markChatRead(
    @Param("chatId") chatId: string,
    @Body() body: MarkChatReadDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.chatService.markChatRead(
      chatId,
      request.user.sub,
      body.messageID,
    );
  }

  @Post(":chatId/messages/:messageID/read")
  markMessageRead(
    @Param("chatId") chatId: string,
    @Param("messageID") messageID: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.chatService.markChatRead(
      chatId,
      request.user.sub,
      messageID,
    );
  }

  @Post(":chatId/typing")
  updateTyping(
    @Param("chatId") chatId: string,
    @Body() body: UpdateTypingDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.chatService.setTyping(chatId, request.user.sub, body.isTyping);
  }
}
