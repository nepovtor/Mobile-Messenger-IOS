"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const chat_entity_1 = require("../../entities/chat.entity");
const chat_participant_entity_1 = require("../../entities/chat-participant.entity");
const media_entity_1 = require("../../entities/media.entity");
const message_entity_1 = require("../../entities/message.entity");
const user_entity_1 = require("../../entities/user.entity");
const contact_utils_1 = require("../common/contact.utils");
const media_service_1 = require("../media/media.service");
const realtime_service_1 = require("../realtime/realtime.service");
let ChatService = class ChatService {
    constructor(chatsRepository, participantsRepository, messagesRepository, usersRepository, mediaRepository, realtimeService, mediaService) {
        this.chatsRepository = chatsRepository;
        this.participantsRepository = participantsRepository;
        this.messagesRepository = messagesRepository;
        this.usersRepository = usersRepository;
        this.mediaRepository = mediaRepository;
        this.realtimeService = realtimeService;
        this.mediaService = mediaService;
    }
    async createChat(dto, user) {
        const title = dto.title.trim();
        if (!title) {
            throw new common_1.BadRequestException("Chat title is required");
        }
        const otherUsers = await this.resolveParticipants(dto);
        const participantIDs = new Set([
            user.sub,
            ...otherUsers.map((item) => item.id),
        ]);
        const normalizedParticipantIDs = Array.from(participantIDs).sort();
        if (normalizedParticipantIDs.length === 2) {
            const existingDirectChat = await this.findExistingDirectChat(normalizedParticipantIDs);
            if (existingDirectChat) {
                return this.getChatSummary(existingDirectChat.id, user.sub);
            }
        }
        const chat = await this.chatsRepository.save(this.chatsRepository.create({
            title,
            lastMessagePreview: null,
            lastActivity: new Date(),
        }));
        const participantEntities = Array.from(participantIDs).map((participantID) => this.participantsRepository.create({
            chatId: chat.id,
            userId: participantID,
            lastReadAt: null,
            lastReadMessageId: null,
        }));
        await this.participantsRepository.save(participantEntities);
        const summary = await this.getChatSummary(chat.id, user.sub);
        const createdPayload = { chatID: chat.id, chat: summary };
        this.realtimeService.publishToUsers(Array.from(participantIDs), {
            type: "chat.created",
            payload: createdPayload,
        });
        return summary;
    }
    async listChats(userID, search) {
        const participants = await this.participantsRepository.find({
            where: { userId: userID },
            relations: { chat: true },
            order: { chat: { lastActivity: "DESC" } },
        });
        const summaries = await Promise.all(participants.map((participant) => this.buildChatSummaryEnvelope(participant.chat, participant, userID)));
        const normalizedSearch = search?.trim().toLowerCase();
        const filtered = summaries.filter(({ summary }) => {
            if (!normalizedSearch) {
                return true;
            }
            return [
                summary.title,
                summary.lastMessagePreview ?? "",
                ...summary.participantNames,
            ].some((value) => value.toLowerCase().includes(normalizedSearch));
        });
        filtered.sort((left, right) => right.summary.lastActivity.getTime() -
            left.summary.lastActivity.getTime());
        const deduped = new Map();
        for (const item of filtered) {
            if (!deduped.has(item.dedupeKey)) {
                deduped.set(item.dedupeKey, item.summary);
            }
        }
        return Array.from(deduped.values());
    }
    async getMessages(chatID, userID, limit = 100, before) {
        await this.getParticipantOrFail(chatID, userID);
        let createdBefore;
        if (before) {
            const beforeMessage = await this.messagesRepository.findOneBy({
                id: before,
                chatId: chatID,
            });
            if (beforeMessage) {
                createdBefore = beforeMessage.createdAt;
            }
        }
        const messages = await this.messagesRepository.find({
            where: {
                chatId: chatID,
                ...(createdBefore ? { createdAt: (0, typeorm_2.LessThanOrEqual)(createdBefore) } : {}),
            },
            relations: { author: true, media: true },
            order: { createdAt: "DESC" },
            take: Math.min(Math.max(limit, 1), 200),
        });
        const filteredMessages = before
            ? messages.filter((message) => message.id !== before)
            : messages;
        const ascending = filteredMessages.reverse();
        return Promise.all(ascending.map((message) => this.mapMessage(message)));
    }
    async addMessage(chatID, dto, user) {
        const participant = await this.getParticipantOrFail(chatID, user.sub);
        const participants = await this.participantsRepository.find({
            where: { chatId: chatID },
        });
        const trimmedText = dto.text?.trim();
        let media = null;
        if (dto.kind === message_entity_1.MessageKind.TEXT) {
            if (!trimmedText) {
                throw new common_1.BadRequestException("Text message must contain text");
            }
        }
        else if (dto.kind === message_entity_1.MessageKind.IMAGE) {
            if (!dto.mediaID) {
                throw new common_1.BadRequestException("Image message must contain mediaID");
            }
            media = await this.mediaService.getUploadedMediaOrFail(dto.mediaID);
            if (media.uploadedById !== user.sub) {
                throw new common_1.BadRequestException("Media belongs to another user");
            }
        }
        else {
            throw new common_1.BadRequestException("Unsupported message kind");
        }
        const message = await this.messagesRepository.save(this.messagesRepository.create({
            chatId: chatID,
            authorId: user.sub,
            clientMessageId: dto.messageID,
            kind: dto.kind,
            text: dto.kind === message_entity_1.MessageKind.TEXT
                ? trimmedText || null
                : trimmedText || null,
            mediaId: media?.id ?? null,
            status: participants.length > 1
                ? message_entity_1.MessageStatus.DELIVERED
                : message_entity_1.MessageStatus.SENT,
        }));
        participant.lastReadAt = message.createdAt;
        participant.lastReadMessageId = message.id;
        await this.participantsRepository.save(participant);
        const chat = await this.chatsRepository.findOneBy({
            id: chatID,
        });
        if (!chat) {
            throw new common_1.NotFoundException("Chat not found");
        }
        chat.lastMessagePreview =
            dto.kind === message_entity_1.MessageKind.IMAGE ? "Фото" : trimmedText || null;
        chat.lastActivity = message.createdAt;
        await this.chatsRepository.save(chat);
        const hydratedMessage = await this.messagesRepository.findOne({
            where: { id: message.id },
            relations: { author: true, media: true },
        });
        if (!hydratedMessage) {
            throw new common_1.NotFoundException("Message not found after save");
        }
        const payload = await this.mapMessage(hydratedMessage);
        this.realtimeService.publishToUsers(participants.map((item) => item.userId), {
            type: "message.created",
            payload: {
                chatID,
                message: payload,
            },
        });
        return payload;
    }
    async markRead(chatID, messageID, user) {
        const participant = await this.getParticipantOrFail(chatID, user.sub);
        const message = await this.messagesRepository.findOne({
            where: { id: messageID, chatId: chatID },
        });
        if (!message) {
            throw new common_1.NotFoundException("Message not found");
        }
        participant.lastReadAt = message.createdAt;
        participant.lastReadMessageId = message.id;
        await this.participantsRepository.save(participant);
        await this.messagesRepository.update({
            chatId: chatID,
            authorId: (0, typeorm_2.Not)(user.sub),
            createdAt: (0, typeorm_2.LessThanOrEqual)(message.createdAt),
        }, {
            status: message_entity_1.MessageStatus.READ,
        });
        const participants = await this.participantsRepository.find({
            where: { chatId: chatID },
        });
        this.realtimeService.publishToUsers(participants.map((item) => item.userId), {
            type: "message.read",
            payload: {
                chatID,
                messageID,
                userID: user.sub,
                readAt: message.createdAt.toISOString(),
            },
        });
        return { ok: true };
    }
    async setTyping(chatID, dto, user) {
        await this.getParticipantOrFail(chatID, user.sub);
        const participants = await this.participantsRepository.find({
            where: { chatId: chatID },
        });
        const typingParticipants = this.realtimeService.setTyping(chatID, user.sub, user.displayName, dto.isTyping);
        this.realtimeService.publishToUsers(participants.map((item) => item.userId), {
            type: "typing.changed",
            payload: {
                chatID,
                userID: user.sub,
                displayName: user.displayName,
                isTyping: dto.isTyping,
                typingParticipants,
            },
        });
        return {
            typingParticipants,
        };
    }
    async resolveParticipants(dto) {
        const byID = dto.participantIDs?.length
            ? await this.usersRepository.find({
                where: { id: (0, typeorm_2.In)(dto.participantIDs) },
            })
            : [];
        const byContact = dto.participantContacts?.length
            ? await this.resolveParticipantsByContact(dto.participantContacts)
            : [];
        const uniqueUsers = new Map();
        for (const user of [...byID, ...byContact]) {
            uniqueUsers.set(user.id, user);
        }
        return Array.from(uniqueUsers.values());
    }
    async resolveParticipantsByContact(contacts) {
        const allUsers = await this.usersRepository.find();
        const result = new Map();
        for (const rawContact of contacts) {
            const normalizedVariants = new Set();
            try {
                normalizedVariants.add((0, contact_utils_1.normalizeContact)(user_entity_1.AuthMethod.EMAIL, rawContact));
            }
            catch {
            }
            try {
                normalizedVariants.add((0, contact_utils_1.normalizeContact)(user_entity_1.AuthMethod.PHONE, rawContact));
            }
            catch {
            }
            const match = allUsers.find((candidate) => normalizedVariants.has(candidate.contact));
            if (match) {
                result.set(match.id, match);
            }
        }
        return Array.from(result.values());
    }
    async getParticipantOrFail(chatID, userID) {
        const participant = await this.participantsRepository.findOne({
            where: { chatId: chatID, userId: userID },
            relations: { chat: true },
        });
        if (!participant) {
            throw new common_1.NotFoundException("Chat not found for current user");
        }
        return participant;
    }
    async getChatSummary(chatID, userID) {
        const participant = await this.getParticipantOrFail(chatID, userID);
        return (await this.buildChatSummaryEnvelope(participant.chat, participant, userID)).summary;
    }
    async buildChatSummaryEnvelope(chat, participant, userID) {
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
        const otherParticipants = participants.filter((item) => item.userId !== userID);
        return {
            summary: {
                id: chat.id,
                title: chat.title,
                lastMessagePreview: chat.lastMessagePreview,
                lastActivity: chat.lastActivity,
                unreadCount,
                typingParticipants: this.realtimeService.getTypingParticipants(chat.id, userID),
                participantNames: otherParticipants.map((item) => item.user.displayName),
                participantCount: participants.length,
            },
            dedupeKey: participants.length === 2
                ? `direct:${otherParticipants
                    .map((item) => item.userId)
                    .sort()
                    .join(":")}`
                : `chat:${chat.id}`,
        };
    }
    async mapMessage(message) {
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
        };
    }
    async findExistingDirectChat(participantIDs) {
        if (participantIDs.length !== 2) {
            return null;
        }
        const candidateParticipants = await this.participantsRepository.find({
            where: {
                userId: (0, typeorm_2.In)(participantIDs),
            },
            relations: {
                chat: true,
            },
        });
        const candidateChatIDs = Array.from(candidateParticipants.reduce((result, participant) => {
            const chatParticipants = result.get(participant.chatId) ?? new Set();
            chatParticipants.add(participant.userId);
            result.set(participant.chatId, chatParticipants);
            return result;
        }, new Map()))
            .filter(([, userIDs]) => userIDs.size === participantIDs.length)
            .map(([chatID]) => chatID);
        if (candidateChatIDs.length === 0) {
            return null;
        }
        const fullParticipants = await this.participantsRepository.find({
            where: {
                chatId: (0, typeorm_2.In)(candidateChatIDs),
            },
            relations: {
                chat: true,
            },
        });
        const normalizedParticipantsKey = participantIDs.slice().sort().join(":");
        const matchedChats = Array.from(fullParticipants.reduce((result, participant) => {
            const entry = result.get(participant.chatId) ?? {
                userIDs: [],
                chat: participant.chat,
            };
            entry.userIDs.push(participant.userId);
            result.set(participant.chatId, entry);
            return result;
        }, new Map()))
            .filter(([, entry]) => {
            const key = entry.userIDs.slice().sort().join(":");
            return (entry.userIDs.length === participantIDs.length &&
                key === normalizedParticipantsKey);
        })
            .map(([, entry]) => entry.chat)
            .sort((left, right) => right.lastActivity.getTime() - left.lastActivity.getTime());
        return matchedChats[0] ?? null;
    }
};
exports.ChatService = ChatService;
exports.ChatService = ChatService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(chat_entity_1.ChatEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(chat_participant_entity_1.ChatParticipantEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(message_entity_1.MessageEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(4, (0, typeorm_1.InjectRepository)(media_entity_1.MediaEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        realtime_service_1.RealtimeService,
        media_service_1.MediaService])
], ChatService);
//# sourceMappingURL=chat.service.js.map