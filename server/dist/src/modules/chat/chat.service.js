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
var ChatService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const chat_entity_1 = require("../../entities/chat.entity");
const chat_read_state_entity_1 = require("../../entities/chat-read-state.entity");
const message_entity_1 = require("../../entities/message.entity");
const user_entity_1 = require("../../entities/user.entity");
const chat_events_service_1 = require("./chat-events.service");
let ChatService = ChatService_1 = class ChatService {
    constructor(chatRepository, chatReadStateRepository, messageRepository, userRepository, chatEventsService) {
        this.chatRepository = chatRepository;
        this.chatReadStateRepository = chatReadStateRepository;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.chatEventsService = chatEventsService;
        this.logger = new common_1.Logger(ChatService_1.name);
        this.typingTTL = 5_000;
        this.typingParticipants = new Map();
    }
    async onModuleInit() {
        await this.initializeCommonChat();
    }
    async listChats(userID) {
        const chats = await this.chatRepository.find({
            relations: ["participants"],
            order: { lastActivity: "DESC", createdAt: "DESC" },
        });
        return Promise.all(chats
            .filter((chat) => this.hasAccess(chat, userID))
            .map((chat) => this.toChatDto(chat, userID)));
    }
    async getChat(chatId, userID) {
        const normalizedChatID = chatId.toLowerCase();
        const chat = await this.requireChatAccess(normalizedChatID, userID);
        return this.toChatDto(chat, userID);
    }
    async getMessages(chatId, userID) {
        const normalizedChatID = chatId.toLowerCase();
        await this.requireChatAccess(normalizedChatID, userID);
        const messages = await this.messageRepository.find({
            where: { chat: { id: normalizedChatID } },
            relations: ["author"],
            order: { createdAt: "ASC" },
        });
        return messages.map((message) => this.toMessageDto(message, normalizedChatID));
    }
    async addMessage(chatId, data, authorID) {
        const normalizedChatID = chatId.toLowerCase();
        const chat = await this.requireChatAccess(normalizedChatID, authorID);
        const normalizedMessageID = data.messageID.toLowerCase();
        const trimmedText = data.text.trim();
        const existingMessage = await this.messageRepository.findOne({
            where: { messageID: normalizedMessageID },
            relations: ["author", "chat"],
        });
        if (existingMessage) {
            if (existingMessage.chat.id !== normalizedChatID ||
                existingMessage.author.id !== authorID) {
                throw new common_1.ForbiddenException("Message ID already belongs to another message");
            }
            return this.toMessageDto(existingMessage, normalizedChatID);
        }
        const author = await this.userRepository.findOne({
            where: { id: authorID },
        });
        if (!author) {
            throw new common_1.NotFoundException("Author not found");
        }
        const message = this.messageRepository.create({
            messageID: normalizedMessageID,
            text: trimmedText,
            author,
            chat,
            createdAt: new Date(),
            status: "delivered",
        });
        await this.messageRepository.save(message);
        chat.lastMessagePreview = trimmedText.slice(0, 50);
        chat.lastActivity = message.createdAt;
        await this.chatRepository.save(chat);
        const messageDto = this.toMessageDto(message, normalizedChatID);
        this.chatEventsService.publishMessage(normalizedChatID, messageDto);
        await this.publishChatUpdated(chat);
        return messageDto;
    }
    async createChat(body, ownerID) {
        const participantIDsFromContacts = body.participantContacts?.length
            ? (await this.userRepository.findBy({
                phone: (0, typeorm_2.In)(body.participantContacts),
            })).map((user) => user.id)
            : [];
        const participantIDs = Array.from(new Set([
            ...(body.participantIds ?? []),
            ...participantIDsFromContacts,
            ownerID,
        ]));
        const participants = await this.userRepository.findBy({
            id: (0, typeorm_2.In)(participantIDs),
        });
        const chat = this.chatRepository.create({
            title: body.title.trim(),
            participants,
            lastActivity: new Date(),
        });
        const savedChat = await this.chatRepository.save(chat);
        return this.toChatDto(savedChat, ownerID);
    }
    async markChatRead(chatId, userID, messageID) {
        const normalizedChatID = chatId.toLowerCase();
        const chat = await this.requireChatAccess(normalizedChatID, userID);
        const user = await this.requireUser(userID);
        const targetMessage = messageID
            ? await this.messageRepository.findOne({
                where: {
                    messageID: messageID.toLowerCase(),
                    chat: { id: normalizedChatID },
                },
                relations: ["author"],
            })
            : await this.messageRepository.findOne({
                where: { chat: { id: normalizedChatID } },
                relations: ["author"],
                order: { createdAt: "DESC" },
            });
        if (messageID && !targetMessage) {
            throw new common_1.NotFoundException("Message not found");
        }
        const readAt = targetMessage?.createdAt ?? chat.lastActivity ?? new Date();
        let readState = await this.chatReadStateRepository.findOne({
            where: {
                chat: { id: normalizedChatID },
                user: { id: userID },
            },
            relations: ["chat", "user"],
        });
        if (!readState) {
            readState = this.chatReadStateRepository.create({
                chat,
                user,
                lastReadAt: readAt,
                lastReadMessageID: targetMessage?.messageID ?? null,
            });
        }
        else {
            const nextReadAt = readState.lastReadAt && readState.lastReadAt > readAt
                ? readState.lastReadAt
                : readAt;
            readState.lastReadAt = nextReadAt;
            readState.lastReadMessageID =
                targetMessage?.messageID ?? readState.lastReadMessageID;
        }
        await this.chatReadStateRepository.save(readState);
        const messagesToMarkRead = await this.messageRepository.find({
            where: { chat: { id: normalizedChatID } },
            relations: ["author"],
            order: { createdAt: "ASC" },
        });
        const updatedMessages = messagesToMarkRead.filter((message) => message.author.id !== userID &&
            message.createdAt <= readAt &&
            message.status !== "read");
        if (updatedMessages.length > 0) {
            for (const message of updatedMessages) {
                message.status = "read";
            }
            await this.messageRepository.save(updatedMessages);
        }
        const chatDto = await this.toChatDto(chat, userID);
        await this.publishChatUpdated(chat);
        return chatDto;
    }
    async setTyping(chatId, userID, isTyping) {
        const normalizedChatID = chatId.toLowerCase();
        const chat = await this.requireChatAccess(normalizedChatID, userID);
        const user = await this.requireUser(userID);
        this.pruneTypingParticipants(normalizedChatID);
        const chatTypingParticipants = this.typingParticipants.get(normalizedChatID) ?? new Map();
        if (isTyping) {
            chatTypingParticipants.set(userID, {
                displayName: user.displayName,
                expiresAt: Date.now() + this.typingTTL,
            });
            this.typingParticipants.set(normalizedChatID, chatTypingParticipants);
        }
        else {
            chatTypingParticipants.delete(userID);
            if (chatTypingParticipants.size === 0) {
                this.typingParticipants.delete(normalizedChatID);
            }
            else {
                this.typingParticipants.set(normalizedChatID, chatTypingParticipants);
            }
        }
        const chatDto = await this.toChatDto(chat, userID);
        await this.publishChatUpdated(chat);
        return chatDto;
    }
    async initializeCommonChat() {
        const existing = await this.chatRepository.findOne({
            where: { title: "General Chat" },
        });
        if (existing) {
            return;
        }
        const chat = this.chatRepository.create({
            title: "General Chat",
            lastActivity: new Date(),
            participants: [],
        });
        await this.chatRepository.save(chat);
        this.logger.log("Seeded General Chat");
    }
    async requireChatAccess(chatId, userID) {
        const chat = await this.chatRepository.findOne({
            where: { id: chatId },
            relations: ["participants"],
        });
        if (!chat) {
            throw new common_1.NotFoundException("Chat not found");
        }
        if (!this.hasAccess(chat, userID)) {
            throw new common_1.ForbiddenException("Access denied");
        }
        return chat;
    }
    hasAccess(chat, userID) {
        return (chat.participants.length === 0 ||
            chat.participants.some((user) => user.id === userID));
    }
    async requireUser(userID) {
        const user = await this.userRepository.findOne({
            where: { id: userID },
        });
        if (!user) {
            throw new common_1.NotFoundException("User not found");
        }
        return user;
    }
    async toChatDto(chat, userID) {
        const unreadCount = await this.getUnreadCount(chat.id, userID);
        return {
            id: chat.id,
            title: chat.title,
            lastMessagePreview: chat.lastMessagePreview,
            lastActivity: (chat.lastActivity ?? chat.createdAt).toISOString(),
            unreadCount,
            typingParticipants: this.getTypingParticipants(chat.id, userID),
        };
    }
    toMessageDto(message, chatId) {
        return {
            id: message.id,
            chatID: chatId,
            messageID: message.messageID,
            text: message.text,
            authorID: message.author.id,
            authorName: message.author.displayName,
            createdAt: message.createdAt.toISOString(),
            status: message.status,
        };
    }
    async getUnreadCount(chatID, userID) {
        const readState = await this.chatReadStateRepository.findOne({
            where: {
                chat: { id: chatID },
                user: { id: userID },
            },
        });
        const query = this.messageRepository
            .createQueryBuilder("message")
            .innerJoin("message.author", "author")
            .innerJoin("message.chat", "chat")
            .where("chat.id = :chatID", { chatID })
            .andWhere("author.id != :userID", { userID });
        if (readState?.lastReadAt) {
            query.andWhere("message.createdAt > :lastReadAt", {
                lastReadAt: readState.lastReadAt,
            });
        }
        return query.getCount();
    }
    getTypingParticipants(chatID, userID) {
        this.pruneTypingParticipants(chatID);
        const chatTypingParticipants = this.typingParticipants.get(chatID);
        if (!chatTypingParticipants) {
            return [];
        }
        return Array.from(chatTypingParticipants.entries())
            .filter(([participantUserID]) => participantUserID !== userID)
            .map(([, participant]) => participant.displayName)
            .sort((left, right) => left.localeCompare(right));
    }
    pruneTypingParticipants(chatID) {
        const now = Date.now();
        const chatIDs = chatID
            ? [chatID]
            : Array.from(this.typingParticipants.keys());
        for (const currentChatID of chatIDs) {
            const participants = this.typingParticipants.get(currentChatID);
            if (!participants) {
                continue;
            }
            for (const [participantUserID, participant] of participants.entries()) {
                if (participant.expiresAt <= now) {
                    participants.delete(participantUserID);
                }
            }
            if (participants.size === 0) {
                this.typingParticipants.delete(currentChatID);
            }
            else {
                this.typingParticipants.set(currentChatID, participants);
            }
        }
    }
    async publishChatUpdated(chat) {
        await this.chatEventsService.publishChatUpdated(chat.id, (userID) => this.toChatDto(chat, userID));
    }
};
exports.ChatService = ChatService;
exports.ChatService = ChatService = ChatService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(chat_entity_1.Chat)),
    __param(1, (0, typeorm_1.InjectRepository)(chat_read_state_entity_1.ChatReadState)),
    __param(2, (0, typeorm_1.InjectRepository)(message_entity_1.Message)),
    __param(3, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        chat_events_service_1.ChatEventsService])
], ChatService);
//# sourceMappingURL=chat.service.js.map