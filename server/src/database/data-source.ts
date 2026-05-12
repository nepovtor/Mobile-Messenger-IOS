import "dotenv/config";
import "reflect-metadata";
import { DataSource } from "typeorm";
import { buildDatabaseOptions } from "./database.config";

export const AppDataSource = new DataSource(buildDatabaseOptions());
