import {
  encryptAttachment,
  decryptAttachment,
  type IEncryptedFile,
} from "matrix-encrypt-attachment";
import type { MatrixClient } from "matrix-js-sdk";

export const attachmentLimit = 10 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const audioTypes = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
]);
export type SecureAttachment = {
  file: IEncryptedFile & { url: string };
  mimetype: string;
  size: number;
  name: string;
  kind: "image" | "audio";
};
export type PendingAttachment = Omit<SecureAttachment, "file"> & {
  file: IEncryptedFile;
  ciphertext: string;
};
function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    result += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(result);
}
export function attachmentBytes(
  value: PendingAttachment,
): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.ciphertext), (character) =>
    character.charCodeAt(0),
  );
}
export function validAttachment(value: unknown, pending = false): boolean {
  if (!value || typeof value !== "object") return false;
  const item = value as SecureAttachment & Partial<PendingAttachment>;
  const file = item.file;
  return (
    !!file &&
    file.v === "v2" &&
    file.key?.kty === "oct" &&
    file.key.alg === "A256CTR" &&
    /^[A-Za-z0-9_-]{43}$/.test(file.key.k) &&
    /^[A-Za-z0-9+/]{22}$/.test(file.iv) &&
    /^[A-Za-z0-9+/]{43}$/.test(file.hashes?.sha256 ?? "") &&
    (item.kind === "image"
      ? imageTypes
      : item.kind === "audio"
        ? audioTypes
        : new Set()
    ).has(item.mimetype) &&
    Number.isInteger(item.size) &&
    item.size > 0 &&
    item.size <= attachmentLimit &&
    typeof item.name === "string" &&
    item.name.length > 0 &&
    item.name.length <= 160 &&
    (pending
      ? typeof item.ciphertext === "string" &&
        item.ciphertext.length === 4 * Math.ceil(item.size / 3) &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          item.ciphertext,
        )
      : typeof file.url === "string" &&
        /^mxc:\/\/[^/\s]+\/[^/\s?#]+$/.test(file.url))
  );
}
export async function prepareAttachment(
  file: File,
): Promise<PendingAttachment> {
  const kind = imageTypes.has(file.type)
    ? "image"
    : audioTypes.has(file.type)
      ? "audio"
      : undefined;
  if (!kind)
    throw new Error(
      "Выберите JPEG, PNG, WebP или аудиофайл MP4, MP3, OGG, WebM, WAV",
    );
  if (!file.size || file.size > attachmentLimit)
    throw new Error("Размер вложения должен быть от 1 байта до 10 МБ");
  const plaintext = await file.arrayBuffer();
  try {
    const encrypted = await encryptAttachment(plaintext);
    const result: PendingAttachment = {
      file: encrypted.info,
      ciphertext: bytesToBase64(new Uint8Array(encrypted.data)),
      kind,
      mimetype: file.type,
      size: file.size,
      name:
        Array.from(file.name, (character) =>
          character.charCodeAt(0) < 32 ||
          character.charCodeAt(0) === 127 ||
          character === "/" ||
          character === "\\"
            ? "_"
            : character,
        )
          .join("")
          .slice(0, 160) || "Вложение",
    };
    new Uint8Array(encrypted.data).fill(0);
    return result;
  } finally {
    new Uint8Array(plaintext).fill(0);
  }
}
export function attachmentFromContent(
  content: Record<string, unknown>,
): SecureAttachment | undefined {
  const info = content.info as { mimetype?: string; size?: number } | undefined;
  const attachment = {
    file: content.file,
    mimetype: info?.mimetype,
    size: info?.size,
    name: content.body,
    kind:
      content.msgtype === "m.image"
        ? "image"
        : content.msgtype === "m.audio"
          ? "audio"
          : undefined,
  };
  return validAttachment(attachment)
    ? (attachment as SecureAttachment)
    : undefined;
}
export async function downloadAttachment(
  client: MatrixClient,
  attachment: SecureAttachment,
  signal: AbortSignal,
): Promise<Blob> {
  if (!validAttachment(attachment))
    throw new Error("Параметры вложения повреждены");
  const url = client.mxcUrlToHttp(
    attachment.file.url,
    undefined,
    undefined,
    undefined,
    false,
    false,
    true,
  );
  const token = client.getAccessToken();
  if (
    !url ||
    !token ||
    new URL(url).origin !== new URL(client.getHomeserverUrl()).origin
  )
    throw new Error("Не удалось проверить адрес вложения");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    credentials: "omit",
    signal,
  });
  if (!response.ok || !response.body)
    throw new Error("Не удалось загрузить вложение");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > attachment.size || size > attachmentLimit)
        throw new Error("Вложение превышает допустимый размер");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  if (size !== attachment.size)
    throw new Error("Вложение загружено не полностью");
  const ciphertext = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    ciphertext.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    // The official helper verifies the SHA-256 ciphertext hash before decrypting.
    const plaintext = await decryptAttachment(
      ciphertext.buffer,
      attachment.file,
    );
    try {
      return new Blob([plaintext], { type: attachment.mimetype });
    } finally {
      new Uint8Array(plaintext).fill(0);
    }
  } finally {
    ciphertext.fill(0);
    chunks.forEach((chunk) => chunk.fill(0));
  }
}
