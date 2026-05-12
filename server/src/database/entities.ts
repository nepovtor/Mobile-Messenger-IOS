import { AdminEntity } from "../entities/admin.entity";
import { ChatEntity } from "../entities/chat.entity";
import { ChatParticipantEntity } from "../entities/chat-participant.entity";
import { ContactEntity } from "../entities/contact.entity";
import { LocationShareEntity } from "../entities/location-share.entity";
import { MediaEntity } from "../entities/media.entity";
import { MessageEntity } from "../entities/message.entity";
import { PhoneVerificationCodeEntity } from "../entities/phone-verification-code.entity";
import { PushSubscriptionEntity } from "../entities/push-subscription.entity";
import { TelegramLinkEntity } from "../entities/telegram-link.entity";
import { TelegramPairingTokenEntity } from "../entities/telegram-pairing-token.entity";
import { UserEntity } from "../entities/user.entity";

export const DATABASE_ENTITIES = [
  AdminEntity,
  ChatEntity,
  ChatParticipantEntity,
  ContactEntity,
  LocationShareEntity,
  MediaEntity,
  MessageEntity,
  PhoneVerificationCodeEntity,
  PushSubscriptionEntity,
  TelegramLinkEntity,
  TelegramPairingTokenEntity,
  UserEntity,
] as const;
