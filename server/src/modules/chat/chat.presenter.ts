import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { ChatEntity } from "../../entities/chat.entity";
import { ChatParticipantEntity } from "../../entities/chat-participant.entity";
import { MessageEntity } from "../../entities/message.entity";
import { ChatEventsService } from "../chat-events/chat-events.service";
import { MediaService } from "../media/media.service";
import type { ChatSummary, MessageResponse } from "./chat.service";

type ChatSummaryInput = {
  chat: ChatEntity;
  participant: ChatParticipantEntity;
};

type ChatSummaryResult = {
  summary: ChatSummary;
  dedupeKey: string;
};

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
  ): Promise<ChatSummaryResult> {
    const [result] = await this.buildSummaries([{ chat, participant }], userID);
    if (!result) {
      throw new Error(`Failed to build summary for chat ${chat.id}`);
    }
    return result;
  }

  async buildSummaries(
    inputs: ChatSummaryInput[],
    userID: string,
  ): Promise<ChatSummaryResult[]> {
    if (inputs.length === 0) {
      return [];
    }

    const chatIDs = inputs.map(({ chat }) => chat.id);
    const participants = await this.participantsRepository.find({
      where: { chatId: In(chatIDs) },
      relations: { user: true },
    });

    const participantsByChatID = new Map<string, ChatParticipantEntity[]>();
    for (const item of participants) {
      const chatParticipants = participantsByChatID.get(item.chatId) ?? [];
      chatParticipants.push(item);
      participantsByChatID.set(item.chatId, chatParticipants);
    }

    const unreadRows = await this.messagesRepository
      .createQueryBuilder("message")
      .select("message.chat_id", "chatID")
      .addSelect("COUNT(*)", "unreadCount")
      .innerJoin(
        ChatParticipantEntity,
        "viewer",
        "viewer.chat_id = message.chat_id AND viewer.user_id = :userID",
        { userID },
      )
      .where("message.chat_id IN (:...chatIDs)", { chatIDs })
      .andWhere("message.author_id != :userID", { userID })
      .andWhere(
        "(viewer.last_read_at IS NULL OR message.created_at > viewer.last_read_at)",
      )
      .groupBy("message.chat_id")
      .getRawMany<{ chatID: string; unreadCount: string }>();
    const unreadCountByChatID = new Map(
      unreadRows.map((row) => [row.chatID, Number(row.unreadCount)]),
    );

    const missingLastMessageIDs = inputs.flatMap(({ chat }) =>
      chat.lastMessageId && !chat.lastMessage ? [chat.lastMessageId] : [],
    );
    const missingLastMessages =
      missingLastMessageIDs.length > 0
        ? await this.messagesRepository.findBy({
            id: In(missingLastMessageIDs),
          })
        : [];
    const missingLastMessageByID = new Map(
      missingLastMessages.map((message) => [message.id, message]),
    );

    return inputs.map(({ chat }) => {
      const chatParticipants = participantsByChatID.get(chat.id) ?? [];
      const otherParticipants = chatParticipants.filter(
        (item) => item.userId !== userID,
      );
      const displayTitle =
        chatParticipants.length === 2
          ? (otherParticipants[0]?.user.displayName ?? chat.title)
          : chat.title;
      const lastMessage =
        chat.lastMessage ??
        (chat.lastMessageId
          ? (missingLastMessageByID.get(chat.lastMessageId) ?? null)
          : null);

      return {
        summary: {
          id: chat.id,
          title: displayTitle,
          lastMessagePreview: this.messagePreview(lastMessage),
          lastActivity: chat.lastActivity,
          unreadCount: unreadCountByChatID.get(chat.id) ?? 0,
          typingParticipants: this.chatEvents.getTypingParticipants(
            chat.id,
            userID,
          ),
          participantNames: otherParticipants.map(
            (item) => item.user.displayName,
          ),
          participantCount: chatParticipants.length,
        },
        dedupeKey:
          chatParticipants.length === 2
            ? `direct:${otherParticipants
                .map((item) => item.userId)
                .sort()
                .join(":")}`
            : `chat:${chat.id}`,
      };
    });
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
