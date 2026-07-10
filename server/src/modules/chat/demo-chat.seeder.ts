import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChatEntity } from "../../entities/chat.entity";
import { ChatParticipantEntity } from "../../entities/chat-participant.entity";
import {
  MessageEntity,
  MessageKind,
  MessageStatus,
} from "../../entities/message.entity";
import { AuthMethod, UserEntity } from "../../entities/user.entity";
import { isDemoChatSeedingEnabled } from "../common/runtime-config";

@Injectable()
export class DemoChatSeeder implements OnModuleInit {
  constructor(
    @InjectRepository(ChatEntity)
    private readonly chatsRepository: Repository<ChatEntity>,
    @InjectRepository(ChatParticipantEntity)
    private readonly participantsRepository: Repository<ChatParticipantEntity>,
    @InjectRepository(MessageEntity)
    private readonly messagesRepository: Repository<MessageEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isDemoChatSeedingEnabled()) {
      return;
    }
    await this.seedDemoChats();
  }

  private async seedDemoChats(): Promise<void> {
    const demoUsers = new Map<string, UserEntity>();
    for (const account of [
      ["+15551230011", "Анна Demo"],
      ["+15551230012", "Борис Demo"],
      ["+15551230013", "Вера Demo"],
      ["+15551230014", "Глеб Demo"],
      ["+15551230015", "Даша Demo"],
    ] as const) {
      const [contact, displayName] = account;
      let user = await this.usersRepository.findOne({
        where: { contact },
      });
      if (!user) {
        user = await this.usersRepository.save(
          this.usersRepository.create({
            method: AuthMethod.PHONE,
            contact,
            phone: contact,
            displayName,
          }),
        );
      }
      demoUsers.set(contact, user);
    }

    const seeds = [
      {
        id: "10000000-0000-0000-0000-000000000001",
        title: "Анна и Борис",
        participants: ["+15551230011", "+15551230012"],
        messages: [
          {
            id: "20000000-0000-0000-0000-000000000001",
            author: "+15551230011",
            text: "Привет, Борис!",
          },
        ],
      },
      {
        id: "10000000-0000-0000-0000-000000000002",
        title: "Анна и Вера",
        participants: ["+15551230011", "+15551230013"],
        messages: [
          {
            id: "20000000-0000-0000-0000-000000000002",
            author: "+15551230013",
            text: "Я собрала идеи для фото.",
          },
        ],
      },
      {
        id: "10000000-0000-0000-0000-000000000003",
        title: "Борис и Глеб",
        participants: ["+15551230012", "+15551230014"],
        messages: [
          {
            id: "20000000-0000-0000-0000-000000000003",
            author: "+15551230014",
            text: "Соберу билд сегодня вечером.",
          },
        ],
      },
      {
        id: "10000000-0000-0000-0000-000000000004",
        title: "Demo Team",
        participants: [
          "+15551230011",
          "+15551230012",
          "+15551230014",
          "+15551230015",
        ],
        messages: [
          {
            id: "20000000-0000-0000-0000-000000000004",
            author: "+15551230015",
            text: "Проверила demo flow перед ревью.",
          },
        ],
      },
    ];

    for (const seed of seeds) {
      let chat: ChatEntity | null = await this.chatsRepository.findOneBy({
        id: seed.id as ChatEntity["id"],
      });

      if (!chat) {
        const seededChat = this.chatsRepository.create({
          id: seed.id as ChatEntity["id"],
          title: seed.title,
          lastActivity: new Date("2026-04-24T12:00:00.000Z"),
          lastMessagePreview: null,
        });
        chat = await this.chatsRepository.save(seededChat);
      }

      if (!chat) {
        continue;
      }

      const existingParticipants = await this.participantsRepository.find({
        where: { chatId: chat.id },
      });
      if (existingParticipants.length === 0) {
        await this.participantsRepository.save(
          seed.participants.map((contact) => {
            const user = demoUsers.get(contact);
            if (!user) {
              throw new Error(`Missing demo user ${contact}`);
            }
            return this.participantsRepository.create({
              chatId: chat.id,
              userId: user.id,
              lastReadAt: null,
              lastReadMessageId: null,
            });
          }),
        );
      }

      for (const seedMessage of seed.messages) {
        const exists = await this.messagesRepository.findOneBy({
          id: seedMessage.id as MessageEntity["id"],
        });
        if (exists) {
          continue;
        }

        const author = demoUsers.get(seedMessage.author);
        if (!author) {
          continue;
        }

        const seededMessage = this.messagesRepository.create({
          id: seedMessage.id as MessageEntity["id"],
          chatId: chat.id,
          authorId: author.id,
          clientMessageId: seedMessage.id as MessageEntity["clientMessageId"],
          kind: MessageKind.TEXT,
          text: seedMessage.text,
          mediaId: null,
          status: MessageStatus.READ,
        });
        await this.messagesRepository.save(seededMessage);

        chat.lastMessagePreview = seedMessage.text;
        chat.lastActivity = new Date("2026-04-24T12:00:00.000Z");
        await this.chatsRepository.save(chat);
      }
    }
  }
}
