import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { MatrixConfig, matrixConfig, matrixUserID } from "./matrix.config";
import type { BindMatrixRoomDto } from "./matrix.controller";

type Participant = { user_id: string; display_name: string; status: string };
type Binding = {
  room_id: string;
  bound_by_user_id: string;
  bound_epoch: number;
};

@Injectable()
export class MatrixService {
  private readonly config = matrixConfig();
  constructor(private readonly database: DataSource) {}
  private requireConfig(): MatrixConfig {
    if (!this.config) throw new NotFoundException();
    return this.config;
  }
  publicConfig(subject: string) {
    const config = this.requireConfig();
    return {
      homeserverURL: config.homeserverURL,
      issuerURL: config.issuerURL,
      serverName: config.serverName,
      webClientID: config.webClientID,
      expectedUserID: matrixUserID(subject, config.serverName),
    };
  }
  private async participants(
    manager: EntityManager,
    subject: string,
    chatID: string,
  ): Promise<Participant[]> {
    const rows: Participant[] = await manager.query(
      `SELECT p.user_id, u.display_name, u.status FROM chat_participants p
      JOIN users u ON u.id=p.user_id WHERE p.chat_id=$1 ORDER BY p.user_id LIMIT 129`,
      [chatID],
    );
    if (!rows.some((row) => row.user_id === subject) || rows.length > 128)
      throw new NotFoundException("Chat unavailable");
    return rows;
  }
  async descriptor(subject: string, chatID: string) {
    const config = this.requireConfig();
    const participants = await this.participants(
      this.database.manager,
      subject,
      chatID,
    );
    const chats: { encryption_epoch: number }[] = await this.database.query(
      `SELECT encryption_epoch FROM chats WHERE id=$1`,
      [chatID],
    );
    const bindings: Binding[] = await this.database.query(
      `SELECT room_id, bound_by_user_id, bound_epoch FROM matrix_lifecycle.chat_rooms WHERE chat_id=$1`,
      [chatID],
    );
    if (!chats[0]) throw new NotFoundException();
    return {
      chatID,
      roomID: bindings[0]?.room_id ?? null,
      epoch: chats[0].encryption_epoch,
      boundEpoch: bindings[0]?.bound_epoch ?? null,
      boundByUserID: bindings[0]?.bound_by_user_id ?? null,
      participants: participants.map((row) => ({
        userID: row.user_id,
        matrixUserID: matrixUserID(row.user_id, config.serverName),
        displayName: row.display_name,
        active: row.status === "active",
      })),
    };
  }
  async bind(subject: string, chatID: string, dto: BindMatrixRoomDto) {
    const config = this.requireConfig();
    if (
      !/^![A-Za-z0-9_-]+(?::[a-z0-9.:-]+)?$/.test(dto.roomID) ||
      (dto.roomID.includes(":") &&
        !dto.roomID.endsWith(`:${config.serverName}`))
    ) {
      throw new ConflictException(
        "Invalid Matrix room ID for the configured server",
      );
    }
    await this.database.transaction(async (manager) => {
      const chats: { encryption_epoch: number }[] = await manager.query(
        `SELECT encryption_epoch FROM chats WHERE id=$1 FOR UPDATE`,
        [chatID],
      );
      const participants = await this.participants(manager, subject, chatID);
      if (
        !chats[0] ||
        chats[0].encryption_epoch !== dto.epoch ||
        participants.some((row) => row.status !== "active")
      ) {
        throw new ConflictException(
          "Chat membership changed; reload before migration",
        );
      }
      await manager.query(
        `INSERT INTO matrix_lifecycle.chat_rooms(chat_id, room_id, bound_by_user_id, bound_epoch)
        VALUES ($1,$2,$3,$4) ON CONFLICT (chat_id) DO NOTHING`,
        [chatID, dto.roomID, subject, dto.epoch],
      );
      const rows: Binding[] = await manager.query(
        `SELECT room_id, bound_epoch FROM matrix_lifecycle.chat_rooms WHERE chat_id=$1`,
        [chatID],
      );
      if (rows[0]?.room_id !== dto.roomID || rows[0].bound_epoch !== dto.epoch)
        throw new ConflictException(
          "Chat already has an immutable Matrix room",
        );
      // The same chat lock is used by legacy message writers and the DB fence.
      await manager.query(`UPDATE chats SET e2ee_required=true WHERE id=$1`, [
        chatID,
      ]);
    });
    return this.descriptor(subject, chatID);
  }
  async revocationStatus(subject: string) {
    this.requireConfig();
    const rows: { pending: boolean }[] = await this.database.query(
      `SELECT generation>completed_generation AS pending
      FROM matrix_lifecycle.revocation_outbox WHERE principal_id=$1`,
      [subject],
    );
    return { pending: rows[0]?.pending ?? false };
  }
}
