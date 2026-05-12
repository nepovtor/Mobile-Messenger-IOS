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

function readDatabaseEnv(
  name: string,
  fallbackName?: string,
): string | undefined {
  const primary = readEnv(name)?.trim();
  if (primary) {
    return primary;
  }

  if (!fallbackName) {
    return undefined;
  }

  const fallback = readEnv(fallbackName)?.trim();
  return fallback || undefined;
}

export function buildDatabaseOptions(): DataSourceOptions {
  const databaseUrl = readDatabaseEnv("DATABASE_URL");

  return {
    type: "postgres",
    url: databaseUrl,
    host: readDatabaseEnv("DB_HOST", "PGHOST") || "localhost",
    port: readPort(readDatabaseEnv("DB_PORT", "PGPORT"), 5432),
    username: readDatabaseEnv("DB_USER", "PGUSER") || "postgres",
    password: readDatabaseEnv("DB_PASSWORD", "PGPASSWORD") || "postgres",
    database: readDatabaseEnv("DB_NAME", "PGDATABASE") || "messenger",
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
