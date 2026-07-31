import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/authenticated-user";
import { EncryptedInboxQueryDto } from "./dto/inbox-query.dto";
import { SubmitEncryptedMessageDto } from "./dto/submit-encrypted-message.dto";
import { EncryptedMessagesService } from "./encrypted-messages.service";

@Controller("encrypted-messages")
@UseGuards(AuthGuard)
export class EncryptedMessagesController {
  constructor(
    private readonly encryptedMessagesService: EncryptedMessagesService,
  ) {}

  @Post()
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitEncryptedMessageDto,
  ) {
    return this.encryptedMessagesService.submit(user, dto);
  }

  @Get("inbox")
  getInbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EncryptedInboxQueryDto,
  ) {
    return this.encryptedMessagesService.getInbox(user, query);
  }

  @Post("inbox/:envelopeID/delivered")
  markDelivered(
    @CurrentUser() user: AuthenticatedUser,
    @Param("envelopeID", new ParseUUIDPipe()) envelopeID: string,
  ) {
    return this.encryptedMessagesService.markDelivered(user, envelopeID);
  }

  @Post("inbox/:envelopeID/read")
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param("envelopeID", new ParseUUIDPipe()) envelopeID: string,
  ) {
    return this.encryptedMessagesService.markRead(user, envelopeID);
  }
}
