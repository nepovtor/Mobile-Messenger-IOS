import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as fs from "node:fs";
import * as path from "node:path";
import { Repository } from "typeorm";
import { ChatEntity } from "../../entities/chat.entity";
import { ContactEntity } from "../../entities/contact.entity";
import { LocationShareEntity } from "../../entities/location-share.entity";
import { MessageEntity } from "../../entities/message.entity";
import { UserEntity } from "../../entities/user.entity";
import { appLogger } from "../common/app-logger";
import {
  getAdminLogin,
  areDemoAccountsEnabled,
  isAdminConsoleEnabled,
  getJwtExpiresIn,
  getS3Bucket,
  getS3Endpoint,
  getS3PublicEndpoint,
  getNodeEnv,
  isJwtConfigured,
  getSmsProvider,
  getVerificationProvider,
  isPasswordLoginEnabled,
  isDatabaseSynchronizationEnabled,
} from "../common/runtime-config";
import { isJsonObject, JsonObject } from "../common/json.types";

function getServerRootDir() {
  return path.join(__dirname, "..", "..", "..");
}

function readJsonFile(filePath: string): JsonObject | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && isJsonObject(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function readCompilerOption(
  config: JsonObject | null,
  key: string,
): string | boolean | null {
  const compilerOptions =
    config &&
    typeof config["compilerOptions"] === "object" &&
    config["compilerOptions"] !== null
      ? (config["compilerOptions"] as JsonObject)
      : null;

  if (!compilerOptions || !(key in compilerOptions)) {
    return null;
  }

  const value = compilerOptions[key];
  return typeof value === "string" || typeof value === "boolean" ? value : null;
}

@Injectable()
export class SystemService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(ContactEntity)
    private readonly contactsRepository: Repository<ContactEntity>,
    @InjectRepository(ChatEntity)
    private readonly chatsRepository: Repository<ChatEntity>,
    @InjectRepository(MessageEntity)
    private readonly messagesRepository: Repository<MessageEntity>,
    @InjectRepository(LocationShareEntity)
    private readonly locationSharesRepository: Repository<LocationShareEntity>,
  ) {}

  async getOverview() {
    const serverRootDir = getServerRootDir();
    const repoRootDir = path.join(serverRootDir, "..");
    const packageJson = readJsonFile(path.join(serverRootDir, "package.json"));
    const tsconfig = readJsonFile(path.join(serverRootDir, "tsconfig.json"));
    const [
      users,
      contacts,
      chats,
      messages,
      sharedLocations,
      recentUsers,
      recentChats,
      recentMessages,
    ] = await Promise.all([
      this.usersRepository.count(),
      this.contactsRepository.count(),
      this.chatsRepository.count(),
      this.messagesRepository.count(),
      this.locationSharesRepository.count(),
      this.usersRepository.find({
        order: { createdAt: "DESC" },
        take: 6,
      }),
      this.chatsRepository.find({
        order: { lastActivity: "DESC" },
        take: 6,
      }),
      this.messagesRepository.find({
        relations: {
          author: true,
          chat: true,
        },
        order: { createdAt: "DESC" },
        take: 8,
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      api: {
        name:
          (typeof packageJson?.["name"] === "string" && packageJson["name"]) ||
          "mobile-messenger-backend",
        version:
          (typeof packageJson?.["version"] === "string" &&
            packageJson["version"]) ||
          "0.0.0",
        environment: getNodeEnv(),
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        basePath: "/api",
      },
      typescript: {
        backendEnabled: true,
        strict: readCompilerOption(tsconfig, "strict"),
        target: readCompilerOption(tsconfig, "target"),
        module: readCompilerOption(tsconfig, "module"),
      },
      logging: {
        ...appLogger.getSummary(),
      },
      docker: {
        rootDockerfilePresent: fs.existsSync(
          path.join(repoRootDir, "Dockerfile"),
        ),
        serverDockerfilePresent: fs.existsSync(
          path.join(serverRootDir, "Dockerfile"),
        ),
        composeFilePresent: fs.existsSync(
          path.join(serverRootDir, "docker-compose.yml"),
        ),
        devComposeFilePresent: fs.existsSync(
          path.join(serverRootDir, "docker-compose.dev.yml"),
        ),
      },
      database: {
        driver: "postgres",
        orm: "typeorm",
        connected: true,
        host: process.env["DB_HOST"] || "localhost",
        port: Number(process.env["DB_PORT"] || "5432"),
        name: process.env["DB_NAME"] || "messenger",
        synchronize: isDatabaseSynchronizationEnabled(),
        counts: {
          users,
          contacts,
          chats,
          messages,
          sharedLocations,
        },
        recentUsers: recentUsers.map((user) => ({
          id: user.id,
          displayName: user.displayName,
          contact: user.contact,
          phone: user.phone,
          createdAt: user.createdAt.toISOString(),
        })),
        recentChats: recentChats.map((chat) => ({
          id: chat.id,
          title: chat.title,
          lastMessagePreview: chat.lastMessagePreview,
          lastActivity: chat.lastActivity.toISOString(),
          createdAt: chat.createdAt.toISOString(),
        })),
        recentMessages: recentMessages.map((message) => ({
          id: message.id,
          chatID: message.chatId,
          chatTitle: message.chat?.title ?? null,
          authorName: message.author?.displayName ?? "Unknown",
          kind: message.kind,
          status: message.status,
          preview:
            message.deletedAt != null
              ? "Message deleted"
              : message.kind === "image"
                ? "Photo"
                : (message.text ?? ""),
          createdAt: message.createdAt.toISOString(),
        })),
      },
      authentication: {
        jwtConfigured: isJwtConfigured(),
        jwtExpiresIn: getJwtExpiresIn(),
        bearerScheme: "Bearer",
        adminConsoleEnabled: isAdminConsoleEnabled(),
        adminLogin: getAdminLogin(),
        verificationProvider: getVerificationProvider(),
        smsProvider: getSmsProvider(),
        demoAccountsEnabled: areDemoAccountsEnabled(),
        passwordLoginEnabled: isPasswordLoginEnabled(),
        publicRoutes: [
          "/api",
          "/api/health",
          "/api/version",
          "/api/login",
          "/api/users",
          "/api/auth/request",
          "/api/auth/verify",
          "/api/auth/login",
          "/api/admin/login",
        ],
        protectedRoutes: [
          "/api/admin/me",
          "/api/auth/me",
          "/api/contacts",
          "/api/chats",
          "/api/location/me",
          "/api/media/upload-url",
          "/api/push/status",
          "/api/system/overview",
        ],
      },
      storage: {
        endpoint: getS3Endpoint(),
        publicEndpoint: getS3PublicEndpoint(),
        bucket: getS3Bucket(),
        configured: Boolean(getS3Endpoint() && getS3Bucket().trim()),
      },
    };
  }

  async getRequestLogs(limit: number) {
    return appLogger.readRecent("request", limit);
  }

  async getErrorLogs(limit: number) {
    return appLogger.readRecent("error", limit);
  }
}
