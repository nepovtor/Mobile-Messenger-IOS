import {
  attachmentBytes,
  attachmentFromContent,
  downloadAttachment,
  validAttachment,
  type PendingAttachment,
  type SecureAttachment,
} from "./encryptedAttachment";
import {
  EventType,
  MsgType,
  Preset,
  RelationType,
  Visibility,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import {
  matrixApi,
  requireDescriptor,
  type MatrixChatDescriptor,
} from "./matrixApi";

export type SecureMessage = {
  id: string;
  sender: string;
  body: string;
  timestamp: number;
  own: boolean;
  failedToDecrypt: boolean;
  attachment?: SecureAttachment;
};

export function assertRoomMembership(
  expected: readonly string[],
  actual: readonly { userId: string; membership?: string }[],
): void {
  const participants = actual
    .filter(
      (member) =>
        member.membership === "join" || member.membership === "invite",
    )
    .map((member) => member.userId);
  if (
    new Set(participants).size !== expected.length ||
    participants.length !== expected.length ||
    expected.some((id) => !participants.includes(id))
  ) {
    throw new Error(
      "Участники защищённой комнаты не совпадают с участниками диалога",
    );
  }
}

export class MatrixRoomTransport {
  private active = true;
  private readonly downloads = new Set<AbortController>();
  private readonly opening = new Map<string, Promise<Room>>();
  constructor(readonly client: MatrixClient) {}
  close(): void {
    this.active = false;
    this.downloads.forEach((controller) => controller.abort());
    this.downloads.clear();
  }
  private requireActive(): void {
    if (!this.active) throw new Error("Сессия закрыта");
  }

  async open(chatID: string): Promise<Room> {
    this.requireActive();
    const current = this.opening.get(chatID);
    if (current) return current;
    const opening = this.openValidated(chatID);
    this.opening.set(chatID, opening);
    try {
      return await opening;
    } finally {
      if (this.opening.get(chatID) === opening) this.opening.delete(chatID);
    }
  }

  private async openValidated(chatID: string): Promise<Room> {
    this.requireActive();
    const ownID = this.client.getUserId();
    if (!ownID) throw new Error("Войдите в защищённую переписку");
    let descriptor = await matrixApi.descriptor(chatID);
    this.requireActive();
    if (descriptor.chatID !== chatID)
      throw new Error("Сервер вернул другой диалог");
    requireDescriptor(descriptor, ownID);
    if (!descriptor.roomID) {
      const created = await this.client.createRoom({
        visibility: Visibility.Private,
        preset: Preset.PrivateChat,
        invite: descriptor.participants
          .map((participant) => participant.matrixUserID)
          .filter((id) => id !== ownID),
        is_direct: descriptor.participants.length === 2,
        initial_state: [
          {
            type: EventType.RoomEncryption,
            state_key: "",
            content: { algorithm: "m.megolm.v1.aes-sha2" },
          },
          {
            type: EventType.RoomHistoryVisibility,
            state_key: "",
            content: { history_visibility: "joined" },
          },
        ],
      });
      this.requireActive();
      try {
        descriptor = await matrixApi.bind(
          chatID,
          created.room_id,
          descriptor.epoch,
        );
      } catch (error) {
        // A competing creator may have won; never send into an unbound room.
        await this.client.leave(created.room_id).catch(() => undefined);
        throw error;
      }
    }
    this.requireActive();
    if (descriptor.chatID !== chatID)
      throw new Error("Сервер вернул другой диалог");
    requireDescriptor(descriptor, ownID);
    if (!descriptor.roomID) throw new Error("Защищённая комната не создана");
    let room = this.client.getRoom(descriptor.roomID);
    if (room?.getMyMembership() !== "join")
      room = await this.client.joinRoom(descriptor.roomID);
    if (!room) throw new Error("Комната ещё синхронизируется");
    await this.validate(room, descriptor);
    this.requireActive();
    return room;
  }

  private async validate(
    room: Room,
    descriptor: MatrixChatDescriptor,
  ): Promise<void> {
    const ownID = this.client.getUserId();
    if (!ownID || room.roomId !== descriptor.roomID)
      throw new Error("Неверный аккаунт или диалог");
    requireDescriptor(descriptor, ownID);
    await room.loadMembersIfNeeded();
    const encryption = room.currentState
      .getStateEvents(EventType.RoomEncryption, "")
      ?.getContent();
    const crypto = this.client.getCrypto();
    if (
      !crypto ||
      encryption?.algorithm !== "m.megolm.v1.aes-sha2" ||
      !(await crypto.isEncryptionEnabledInRoom(room.roomId))
    ) {
      throw new Error("Шифрование комнаты не подтверждено. Отправка запрещена");
    }
    assertRoomMembership(
      descriptor.participants.map((participant) => participant.matrixUserID),
      room.getMembers(),
    );
    for (const participant of descriptor.participants) {
      const verification = await crypto.getUserVerificationStatus(
        participant.matrixUserID,
      );
      if (
        verification.needsUserApproval ||
        (verification.wasCrossSigningVerified() && !verification.isVerified())
      ) {
        throw new Error(
          "Ключи участника изменились. Повторно проверьте его устройство",
        );
      }
    }
    this.requireActive();
  }

  async sendText(
    chatID: string,
    text: string,
    transactionID: string = crypto.randomUUID(),
  ): Promise<string> {
    if (!text.trim() || text.length > 4_000)
      throw new Error("Сообщение должно содержать от 1 до 4000 символов");
    if (!(await this.client.getCrypto()?.isCrossSigningReady()))
      throw new Error(
        "Настройте восстановление или подтвердите это устройство",
      );
    const room = await this.open(chatID);
    this.requireActive();
    const pending = room
      .getPendingEvents()
      .find((event) => event.getTxnId() === transactionID);
    const response = pending
      ? await this.client.resendEvent(pending, room)
      : await this.client.sendTextMessage(room.roomId, text, transactionID);
    this.requireActive();
    return response.event_id;
  }

  async sendAttachment(
    chatID: string,
    attachment: PendingAttachment,
    transactionID: string,
  ): Promise<string> {
    if (!validAttachment(attachment, true))
      throw new Error("Параметры вложения повреждены");
    if (!(await this.client.getCrypto()?.isCrossSigningReady()))
      throw new Error("Подтвердите устройство перед отправкой");
    const room = await this.open(chatID);
    this.requireActive();
    const pending = room
      .getPendingEvents()
      .find((event) => event.getTxnId() === transactionID);
    if (pending) return (await this.client.resendEvent(pending, room)).event_id;
    const ciphertext = attachmentBytes(attachment);
    let url: string;
    try {
      url = (
        await this.client.uploadContent(
          new Blob([ciphertext], { type: "application/octet-stream" }),
          { type: "application/octet-stream", includeFilename: false },
        )
      ).content_uri;
    } finally {
      ciphertext.fill(0);
    }
    this.requireActive();
    // Revalidate membership/epoch after upload before disclosing the media key.
    const checked = await this.open(chatID);
    if (checked.roomId !== room.roomId)
      throw new Error("Комната изменилась во время загрузки");
    const content = {
      body: attachment.name,
      file: {
        ...attachment.file,
        url,
        v: "v2",
        hashes: { sha256: attachment.file.hashes!.sha256! },
      },
      info: { mimetype: attachment.mimetype, size: attachment.size },
    };
    const response = await this.client.sendMessage(
      room.roomId,
      attachment.kind === "image"
        ? { ...content, msgtype: MsgType.Image }
        : { ...content, msgtype: MsgType.Audio },
      transactionID,
    );
    this.requireActive();
    return response.event_id;
  }

  async download(chatID: string, eventID: string): Promise<Blob> {
    const room = await this.open(chatID);
    const event = room.findEventById(eventID);
    if (!event) throw new Error("Вложение больше недоступно");
    const message = await this.decode(event);
    if (!message?.attachment || message.failedToDecrypt)
      throw new Error("Нет защищённого вложения");
    this.requireActive();
    const controller = new AbortController();
    this.downloads.add(controller);
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const blob = await downloadAttachment(
        this.client,
        message.attachment,
        controller.signal,
      );
      this.requireActive();
      return blob;
    } finally {
      clearTimeout(timeout);
      this.downloads.delete(controller);
    }
  }

  async editText(chatID: string, eventID: string, text: string): Promise<void> {
    if (!text.trim() || text.length > 4_000)
      throw new Error("Сообщение должно содержать от 1 до 4000 символов");
    const room = await this.open(chatID);
    this.requireActive();
    const original = room.findEventById(eventID);
    if (
      !original ||
      original.getSender() !== this.client.getUserId() ||
      !original.isEncrypted()
    )
      throw new Error("Можно изменить только своё защищённое сообщение");
    await this.client.sendMessage(room.roomId, {
      msgtype: MsgType.Text,
      body: `* ${text}`,
      "m.new_content": { msgtype: MsgType.Text, body: text },
      "m.relates_to": { rel_type: RelationType.Replace, event_id: eventID },
    });
  }

  async redact(chatID: string, eventID: string): Promise<void> {
    const room = await this.open(chatID);
    this.requireActive();
    const original = room.findEventById(eventID);
    if (!original || original.getSender() !== this.client.getUserId())
      throw new Error("Можно удалить только своё сообщение");
    await this.client.redactEvent(room.roomId, eventID);
  }

  async paginate(chatID: string): Promise<void> {
    const room = await this.open(chatID);
    await this.client.scrollback(room, 50);
    this.requireActive();
  }

  async history(chatID: string): Promise<SecureMessage[]> {
    const room = await this.open(chatID);
    const events = room.getLiveTimeline().getEvents();
    const messages = await Promise.all(
      events.map((event) => this.decode(event)),
    );
    this.requireActive();
    return messages.filter(
      (message): message is SecureMessage => message !== null,
    );
  }

  private async decode(event: MatrixEvent): Promise<SecureMessage | null> {
    // A plaintext event in an encrypted room must never be presented as protected.
    if (!event.isEncrypted() || event.status) return null;
    await this.client.decryptEventIfNeeded(event);
    const failedToDecrypt = event.isDecryptionFailure();
    if (!failedToDecrypt && event.getType() !== EventType.RoomMessage)
      return null;
    const replacement = event.replacingEvent();
    // Preserve the original if SDK aggregation attached an unprotected/foreign edit.
    const content =
      replacement &&
      (!replacement.isEncrypted() ||
        replacement.getSender() !== event.getSender())
        ? event.getOriginalContent()
        : event.getContent();
    if (content.msgtype === "m.key.verification.request") return null;
    if (content["m.relates_to"]?.rel_type === "m.replace") return null;
    return {
      id: event.getId() ?? "",
      sender: event.getSender() ?? "",
      timestamp: event.getTs(),
      body: failedToDecrypt
        ? "Не удалось расшифровать сообщение"
        : event.isRedacted()
          ? "Сообщение удалено"
          : typeof content.body === "string"
            ? content.body
            : "Вложение",
      own: event.getSender() === this.client.getUserId(),
      failedToDecrypt,
      ...(!failedToDecrypt && !event.isRedacted()
        ? { attachment: attachmentFromContent(content) }
        : {}),
    };
  }
}
