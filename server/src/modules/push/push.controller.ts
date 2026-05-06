import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/authenticated-user";
import {
  isProductionEnv,
  isPushTestEndpointEnabled,
} from "../common/runtime-config";
import { DeleteWebPushSubscriptionDto } from "./dto/delete-web-push-subscription.dto";
import { RegisterIosPushDeviceDto } from "./dto/register-ios-push-device.dto";
import { RegisterWebPushSubscriptionDto } from "./dto/register-web-push-subscription.dto";
import { PushService } from "./push.service";

@Controller("push")
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get("vapid-public-key")
  getVapidPublicKey() {
    return this.pushService.getVapidPublicKey();
  }

  @Get("status")
  @UseGuards(AuthGuard)
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.pushService.getStatus(user.sub);
  }

  @Post("subscriptions")
  @UseGuards(AuthGuard)
  registerWebSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterWebPushSubscriptionDto,
  ) {
    return this.pushService.registerWebSubscription(user, dto);
  }

  @Delete("subscriptions")
  @UseGuards(AuthGuard)
  deleteWebSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteWebPushSubscriptionDto,
  ) {
    return this.pushService.deleteWebSubscription(user.sub, dto);
  }

  @Post("devices")
  @UseGuards(AuthGuard)
  registerIosDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterIosPushDeviceDto,
  ) {
    return this.pushService.registerIosDevice(user, dto);
  }

  @Delete("devices/:token")
  @UseGuards(AuthGuard)
  deleteIosDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param("token") token: string,
  ) {
    return this.pushService.deleteIosDevice(user.sub, token);
  }

  @Post("test")
  @UseGuards(AuthGuard)
  async sendTestNotification(@CurrentUser() user: AuthenticatedUser) {
    if (isProductionEnv() && !isPushTestEndpointEnabled()) {
      throw new ForbiddenException("Push test endpoint is disabled.");
    }

    return this.pushService.sendTestNotification(user);
  }
}
