import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/authenticated-user";
import { CreateContactDto } from "./dto/create-contact.dto";
import { ContactsService } from "./contacts.service";

@Controller("contacts")
@UseGuards(AuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  listContacts(@CurrentUser() user: AuthenticatedUser) {
    return this.contactsService.listContacts(user.sub);
  }

  @Post()
  addContact(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContactDto,
  ) {
    return this.contactsService.addContact(user.sub, dto.phone);
  }

  @Get("requests")
  listPendingRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.contactsService.listPendingRequests(user.sub);
  }

  @Post("requests/:requestID/accept")
  acceptRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("requestID", new ParseUUIDPipe()) requestID: string,
  ) {
    return this.contactsService.acceptRequest(user.sub, requestID);
  }

  @Post("requests/:requestID/reject")
  rejectRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("requestID", new ParseUUIDPipe()) requestID: string,
  ) {
    return this.contactsService.rejectRequest(user.sub, requestID);
  }

  @Post(":userID/block")
  blockContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userID", new ParseUUIDPipe()) userID: string,
  ) {
    return this.contactsService.blockContact(user.sub, userID);
  }

  @Post(":userID/unblock")
  unblockContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userID", new ParseUUIDPipe()) userID: string,
  ) {
    return this.contactsService.unblockContact(user.sub, userID);
  }

  @Delete(":identifier")
  removeContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param("identifier", new ParseUUIDPipe()) identifier: string,
  ) {
    return this.contactsService.removeContact(user.sub, identifier);
  }
}
