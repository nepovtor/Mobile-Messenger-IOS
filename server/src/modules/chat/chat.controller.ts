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
import { SendMessageDto } from "./dto/send-message.dto";

@Controller("chats")
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  listChats() {
    return this.chatService.listChats();
  }

  @Get(":chatId/messages")
  getMessages(@Param("chatId") chatId: string) {
    return this.chatService.getMessages(chatId);
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
}
