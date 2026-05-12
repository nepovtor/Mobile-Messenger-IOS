import * as path from "node:path";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { DataSourceOptions } from "typeorm";
import { DATABASE_ENTITIES } from "./entities";
import { isDatabaseSynchronizationEnabled } from "../modules/common/runtime-config";

function readPort(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? `${fallback}`);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readEnv(name: string): string | undefined {
  return process.env[name];
}

export function buildDatabaseOptions(): DataSourceOptions {
  return {
    type: "postgres",
    host: readEnv("DB_HOST")?.trim() || "localhost",
    port: readPort(readEnv("DB_PORT"), 5432),
    username: readEnv("DB_USER")?.trim() || "postgres",
    password: readEnv("DB_PASSWORD")?.trim() || "postgres",
    database: readEnv("DB_NAME")?.trim() || "messenger",
    entities: [...DATABASE_ENTITIES],
    migrations: [path.join(__dirname, "migrations", "*{.ts,.js}")],
    synchronize: isDatabaseSynchronizationEnabled(),
  };
}

export function buildNestDatabaseOptions(): TypeOrmModuleOptions {
  return {
    ...buildDatabaseOptions(),
    autoLoadEntities: false,
    retryAttempts: 5,
    retryDelay: 2000,
  };
}
