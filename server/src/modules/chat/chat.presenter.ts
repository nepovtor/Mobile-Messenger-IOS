import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChatEntity } from "../../entities/chat.entity";
import { ChatParticipantEntity } from "../../entities/chat-participant.entity";
import { MessageEntity } from "../../entities/message.entity";
import { ChatEventsService } from "../chat-events/chat-events.service";
import { MediaService } from "../media/media.service";
import type { ChatSummary, MessageResponse } from "./chat.service";

@Injectable()
export class ChatPresenter {
  constructor(
    @InjectRepository(ChatParticipantEntity)
    private readonly participantsRepository: Repository<ChatParticipantEntity>,
    @InjectRepository(MessageEntity)
    private readonly messagesRepository: Repository<MessageEntity>,
    private readonly chatEvents: ChatEventsService,
    private readonly mediaService: MediaService,
  ) {}

  async buildSummary(
    chat: ChatEntity,
    participant: ChatParticipantEntity,
    userID: string,
  ): Promise<{ summary: ChatSummary; dedupeKey: string }> {
    const participants = await this.participantsRepository.find({
      where: { chatId: chat.id },
      relations: { user: true },
    });
    const unreadQuery = this.messagesRepository
      .createQueryBuilder("message")
      .where("message.chat_id = :chatID", { chatID: chat.id })
      .andWhere("message.author_id != :userID", { userID });

    if (participant.lastReadAt) {
      unreadQuery.andWhere("message.created_at > :lastReadAt", {
        lastReadAt: participant.lastReadAt,
      });
    }

    const unreadCount = await unreadQuery.getCount();
    const otherParticipants = participants.filter(
      (item) => item.userId !== userID,
    );
    const displayTitle =
      participants.length === 2
        ? (otherParticipants[0]?.user.displayName ?? chat.title)
        : chat.title;
    const lastMessage =
      chat.lastMessage ??
      (chat.lastMessageId
        ? await this.messagesRepository.findOneBy({ id: chat.lastMessageId })
        : null);

    return {
      summary: {
        id: chat.id,
        title: displayTitle,
        lastMessagePreview: this.messagePreview(lastMessage),
        lastActivity: chat.lastActivity,
        unreadCount,
        typingParticipants: this.chatEvents.getTypingParticipants(
          chat.id,
          userID,
        ),
        participantNames: otherParticipants.map(
          (item) => item.user.displayName,
        ),
        participantCount: participants.length,
      },
      dedupeKey:
        participants.length === 2
          ? `direct:${otherParticipants
              .map((item) => item.userId)
              .sort()
              .join(":")}`
          : `chat:${chat.id}`,
    };
  }

  async mapMessage(message: MessageEntity): Promise<MessageResponse> {
    return {
      id: message.id,
      messageID: message.clientMessageId,
      chatID: message.chatId,
      authorID: message.authorId,
      authorName: message.author.displayName,
      kind: message.kind,
      text: message.text,
      mediaID: message.mediaId,
      mediaURL: await this.mediaService.buildDownloadUrl(message.media),
      status: message.status,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
    };
  }

  private messagePreview(message: MessageEntity | null): string | null {
    if (!message) {
      return null;
    }
    if (message.deletedAt) {
      return "Сообщение удалено";
    }
    if (message.kind === "image") {
      return "Фото";
    }
    return message.text?.trim() || null;
  }
}
