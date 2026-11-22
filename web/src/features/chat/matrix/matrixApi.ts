import { ApiError, httpRequest } from "@/shared/api/httpClient";

export type MatrixBackendConfig = {
  homeserverURL: string;
  issuerURL: string;
  serverName: string;
  webClientID: string;
  expectedUserID: string;
};

export type MatrixChatDescriptor = {
  chatID: string;
  roomID: string | null;
  epoch: number;
  boundEpoch: number | null;
  participants: {
    userID: string;
    matrixUserID: string;
    displayName: string;
    active: boolean;
  }[];
};

export function secureOrigin(value: string): string {
  const url = new URL(value);
  const local =
    import.meta.env.DEV && ["127.0.0.1", "localhost"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Некорректный адрес сервера защищённой переписки");
  }
  return url.origin;
}

export const matrixApi = {
  async config(ownerUserID?: string): Promise<MatrixBackendConfig | null> {
    try {
      const config = await httpRequest<MatrixBackendConfig>("/matrix/config");
      secureOrigin(config.homeserverURL);
      secureOrigin(config.issuerURL);
      if (
        !config.webClientID ||
        !config.expectedUserID?.startsWith("@") ||
        !config.expectedUserID.endsWith(`:${config.serverName}`)
      )
        throw new Error("Некорректная конфигурация переписки");
      if (
        ownerUserID &&
        config.expectedUserID !==
          `@u_${ownerUserID.replaceAll("-", "").toLowerCase()}:${config.serverName}`
      )
        throw new Error("Настройки переписки принадлежат другому аккаунту");
      return config;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
  descriptor(chatID: string) {
    return httpRequest<MatrixChatDescriptor>(
      `/matrix/chats/${encodeURIComponent(chatID)}`,
    );
  },
  bind(chatID: string, roomID: string, epoch: number) {
    return httpRequest<MatrixChatDescriptor>(
      `/matrix/chats/${encodeURIComponent(chatID)}`,
      {
        method: "POST",
        body: JSON.stringify({ roomID, epoch }),
      },
    );
  },
};

export function requireDescriptor(
  descriptor: MatrixChatDescriptor,
  ownUserID: string,
): void {
  const ids =
    descriptor.participants?.map((participant) => participant.matrixUserID) ??
    [];
  if (
    !Number.isInteger(descriptor.epoch) ||
    descriptor.epoch < 1 ||
    ids.length < 1 ||
    ids.length > 128 ||
    new Set(ids).size !== ids.length ||
    !ids.includes(ownUserID) ||
    descriptor.participants.some((participant) => !participant.active)
  ) {
    throw new Error("Состав участников изменился. Обновите диалог");
  }
  if (descriptor.roomID && descriptor.epoch !== descriptor.boundEpoch) {
    throw new Error(
      "Параметры защиты диалога изменились. Отправка приостановлена",
    );
  }
}
