import { Injectable } from "@nestjs/common";
import { Subject } from "rxjs";

export interface ChatEventEnvelope<T = unknown> {
  event: string;
  data: T;
}

export interface ChatDeliveryEvent<T = unknown> {
  userIDs: string[];
  envelope: ChatEventEnvelope<T>;
}

@Injectable()
export class ChatEventsService {
  private readonly deliverySubject = new Subject<ChatDeliveryEvent>();
  readonly deliveries = this.deliverySubject.asObservable();
  private readonly typingState = new Map<
    string,
    Map<string, { userID: string; displayName: string }>
  >();

  publishToUsers<T>(
    userIDs: string[],
    message: { type: string; payload: T },
  ): void {
    this.deliverySubject.next({
      userIDs: Array.from(new Set(userIDs)),
      envelope: { event: message.type, data: message.payload },
    });
  }

  broadcastToChatParticipants<T>(
    participants: Array<{ userId: string }>,
    envelope: ChatEventEnvelope<T>,
  ): void {
    this.deliverySubject.next({
      userIDs: Array.from(
        new Set(participants.map((participant) => participant.userId)),
      ),
      envelope,
    });
  }

  setTyping(
    chatID: string,
    userID: string,
    displayName: string,
    isTyping: boolean,
  ): string[] {
    const chatTyping =
      this.typingState.get(chatID) ??
      new Map<string, { userID: string; displayName: string }>();
    if (isTyping) {
      chatTyping.set(userID, { userID, displayName });
    } else {
      chatTyping.delete(userID);
    }

    if (chatTyping.size === 0) {
      this.typingState.delete(chatID);
      return [];
    }

    this.typingState.set(chatID, chatTyping);
    return Array.from(chatTyping.values()).map((item) => item.displayName);
  }

  getTypingParticipants(chatID: string, excludeUserID?: string): string[] {
    const chatTyping = this.typingState.get(chatID);
    if (!chatTyping) {
      return [];
    }

    return Array.from(chatTyping.values())
      .filter((item) => item.userID !== excludeUserID)
      .map((item) => item.displayName);
  }
}
