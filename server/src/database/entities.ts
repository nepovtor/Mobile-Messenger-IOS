import { AdminEntity } from "../entities/admin.entity";
import { AuthSessionEntity } from "../entities/auth-session.entity";
import { ChatEntity } from "../entities/chat.entity";
import { ChatParticipantEntity } from "../entities/chat-participant.entity";
import { ContactEntity } from "../entities/contact.entity";
import { ContactRequestEntity } from "../entities/contact-request.entity";
import { EncryptedAttachmentEntity } from "../entities/encrypted-attachment.entity";
import { EncryptedMessageEnvelopeEntity } from "../entities/encrypted-message-envelope.entity";
import { EncryptedMessageEntity } from "../entities/encrypted-message.entity";
import { LocationShareEntity } from "../entities/location-share.entity";
import { LocationPermissionEntity } from "../entities/location-permission.entity";
import { MediaEntity } from "../entities/media.entity";
import { MessageEntity } from "../entities/message.entity";
import { PhoneVerificationCodeEntity } from "../entities/phone-verification-code.entity";
import { PushSubscriptionEntity } from "../entities/push-subscription.entity";
import { OneTimePreKeyEntity } from "../entities/one-time-prekey.entity";
import { RefreshTokenEntity } from "../entities/refresh-token.entity";
import { SecurityAuditEventEntity } from "../entities/security-audit-event.entity";
import { TelegramLinkEntity } from "../entities/telegram-link.entity";
import { TelegramPairingTokenEntity } from "../entities/telegram-pairing-token.entity";
import { UserEntity } from "../entities/user.entity";
import { UserDeviceEntity } from "../entities/user-device.entity";

export const DATABASE_ENTITIES = [
  AdminEntity,
  AuthSessionEntity,
  ChatEntity,
  ChatParticipantEntity,
  ContactEntity,
  ContactRequestEntity,
  EncryptedAttachmentEntity,
  EncryptedMessageEntity,
  EncryptedMessageEnvelopeEntity,
  LocationPermissionEntity,
  LocationShareEntity,
  MediaEntity,
  MessageEntity,
  PhoneVerificationCodeEntity,
  OneTimePreKeyEntity,
  PushSubscriptionEntity,
  RefreshTokenEntity,
  SecurityAuditEventEntity,
  TelegramLinkEntity,
  TelegramPairingTokenEntity,
  UserEntity,
  UserDeviceEntity,
] as const;
