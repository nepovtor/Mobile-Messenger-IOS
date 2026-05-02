import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/authenticated-user";
import { ChatService } from "./chat.service";
import { CreateChatDto } from "./dto/create-chat.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { SetTypingDto } from "./dto/set-typing.dto";
import { UpdateMessageDto } from "./dto/update-message.dto";

@Controller("chats")
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  createChat(
    @Body() dto: CreateChatDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.createChat(dto, user);
  }

  @Get()
  listChats(
    @CurrentUser() user: AuthenticatedUser,
    @Query("search") search?: string,
  ) {
    return this.chatService.listChats(user.sub, search);
  }

  @Get(":chatID/messages")
  getMessages(
    @Param("chatID", new ParseUUIDPipe()) chatID: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query("limit") limit?: string,
    @Query("before") before?: string,
  ) {
    let parsedLimit: number | undefined;
    if (limit !== undefined) {
      parsedLimit = Number(limit);
      if (!Number.isInteger(parsedLimit)) {
        throw new BadRequestException(
          "Validation failed (numeric string is expected)",
        );
      }
    }

    return this.chatService.getMessages(chatID, user.sub, parsedLimit, before);
  }

  @Post(":chatID/messages")
  addMessage(
    @Param("chatID", new ParseUUIDPipe()) chatID: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.addMessage(chatID, dto, user);
  }

  @Post(":chatID/messages/:messageID/read")
  markRead(
    @Param("chatID", new ParseUUIDPipe()) chatID: string,
    @Param("messageID", new ParseUUIDPipe()) messageID: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.markRead(chatID, messageID, user);
  }

  @Patch(":chatID/messages/:messageID")
  updateMessage(
    @Param("chatID", new ParseUUIDPipe()) chatID: string,
    @Param("messageID", new ParseUUIDPipe()) messageID: string,
    @Body() dto: UpdateMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.updateMessage(chatID, messageID, dto, user);
  }

  @Delete(":chatID/messages/:messageID")
  deleteMessage(
    @Param("chatID", new ParseUUIDPipe()) chatID: string,
    @Param("messageID", new ParseUUIDPipe()) messageID: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.deleteMessage(chatID, messageID, user);
  }

  @Post(":chatID/typing")
  setTyping(
    @Param("chatID", new ParseUUIDPipe()) chatID: string,
    @Body() dto: SetTypingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.setTyping(chatID, dto, user);
  }
}
