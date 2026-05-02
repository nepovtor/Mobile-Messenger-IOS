import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/authenticated-user";
import { UpdateLocationDto } from "./dto/update-location.dto";
import { LocationService } from "./location.service";

@Controller("location")
@UseGuards(AuthGuard)
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get("me")
  getMyLocation(@CurrentUser() user: AuthenticatedUser) {
    return this.locationService.getMyLocation(user.sub);
  }

  @Post("me")
  updateMyLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationService.updateMyLocation(user.sub, dto);
  }

  @Delete("me")
  disableMyLocation(@CurrentUser() user: AuthenticatedUser) {
    return this.locationService.disableMyLocation(user.sub);
  }

  @Get("contacts")
  getContactLocations(@CurrentUser() user: AuthenticatedUser) {
    return this.locationService.getContactLocations(user.sub);
  }
}
