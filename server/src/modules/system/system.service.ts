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
  getJwtExpiresIn,
  getNodeEnv,
  isDatabaseSynchronizationEnabled,
} from "../common/runtime-config";

function getServerRootDir() {
  return path.join(__dirname, "..", "..", "..");
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readCompilerOption(
  config: Record<string, unknown> | null,
  key: string,
): string | boolean | null {
  const compilerOptions =
    config &&
    typeof config.compilerOptions === "object" &&
    config.compilerOptions !== null
      ? (config.compilerOptions as Record<string, unknown>)
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
    const [users, contacts, chats, messages, sharedLocations] =
      await Promise.all([
        this.usersRepository.count(),
        this.contactsRepository.count(),
        this.chatsRepository.count(),
        this.messagesRepository.count(),
        this.locationSharesRepository.count(),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      api: {
        name:
          (typeof packageJson?.name === "string" && packageJson.name) ||
          "mobile-messenger-backend",
        version:
          (typeof packageJson?.version === "string" && packageJson.version) ||
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
          path.join(serverRootDir, "docker-compose.dev.yml"),
        ),
      },
      database: {
        driver: "postgres",
        orm: "typeorm",
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || "5432"),
        name: process.env.DB_NAME || "messenger",
        synchronize: isDatabaseSynchronizationEnabled(),
        counts: {
          users,
          contacts,
          chats,
          messages,
          sharedLocations,
        },
      },
      authentication: {
        jwtConfigured: Boolean(process.env.JWT_SECRET?.trim()),
        jwtExpiresIn: getJwtExpiresIn(),
        bearerScheme: "Bearer",
        protectedRoutes: [
          "/api/auth/me",
          "/api/contacts",
          "/api/chats",
          "/api/location/me",
          "/api/system/overview",
        ],
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
