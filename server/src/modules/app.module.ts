import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Chat } from "../entities/chat.entity";
import { ChatReadState } from "../entities/chat-read-state.entity";
import { Message } from "../entities/message.entity";
import { User } from "../entities/user.entity";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { HealthModule } from "./health/health.module";
import { VersionModule } from "./version/version.module";

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "sqlite",
      database: process.env.SQLITE_PATH ?? "database.sqlite",
      entities: [User, Chat, Message, ChatReadState],
      synchronize: process.env.NODE_ENV !== "production",
    }),
    HealthModule,
    VersionModule,
    AuthModule,
    ChatModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
