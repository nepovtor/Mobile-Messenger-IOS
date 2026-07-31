import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/authenticated-user";
import { DevicesService } from "./devices.service";
import { RegisterDeviceDto } from "./dto/register-device.dto";
import { UploadPreKeysDto } from "./dto/upload-prekeys.dto";

@Controller("devices")
@UseGuards(AuthGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post("register")
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.devicesService.registerOrUpdateCurrentDevice(user, dto);
  }

  @Post("current/keys")
  updateCurrentDeviceKeys(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.devicesService.registerOrUpdateCurrentDevice(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.listOwnDevices(user);
  }

  @Post(":deviceID/revoke")
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param("deviceID", new ParseUUIDPipe()) deviceID: string,
  ) {
    return this.devicesService.revokeDevice(user, deviceID);
  }

  @Post("current/prekeys")
  uploadPreKeys(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadPreKeysDto,
  ) {
    return this.devicesService.uploadCurrentDevicePreKeys(user, dto);
  }

  @Get("current/prekeys")
  getPreKeyStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.getCurrentDevicePreKeyStatus(user);
  }

  @Post("key-bundles/:userID")
  claimKeyBundles(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userID", new ParseUUIDPipe()) userID: string,
  ) {
    return this.devicesService.claimPublicKeyBundles(user, userID);
  }
}
