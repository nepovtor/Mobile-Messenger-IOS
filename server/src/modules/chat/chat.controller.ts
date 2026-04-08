import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedRequest } from "../../auth.types";
import { JwtAuthGuard } from "../../jwt-auth.guard";
import { ChatService } from "./chat.service";
import { CreateChatDto } from "./dto/create-chat.dto";
import { MarkChatReadDto } from "./dto/mark-chat-read.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { UpdateTypingDto } from "./dto/update-typing.dto";

@Controller("chats")
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

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

  @Post(":chatId/typing")
  updateTyping(
    @Param("chatId") chatId: string,
    @Body() body: UpdateTypingDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.chatService.setTyping(chatId, request.user.sub, body.isTyping);
  }
}
