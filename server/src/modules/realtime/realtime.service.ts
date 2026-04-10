import { Injectable, MessageEvent } from "@nestjs/common";
import { Observable, Subject, interval, map, merge } from "rxjs";

interface RealtimePayload {
  type: string;
  payload: string | object;
}

@Injectable()
export class RealtimeService {
  private readonly userStreams = new Map<string, Subject<MessageEvent>>();
  private readonly typingState = new Map<
    string,
    Map<string, { userID: string; displayName: string }>
  >();

  subscribe(userID: string): Observable<MessageEvent> {
    const stream = this.getStream(userID);
    return merge(
      stream.asObservable(),
      interval(15000).pipe(
        map(
          (): MessageEvent => ({
            type: "keepalive",
            data: { timestamp: new Date().toISOString() },
          }),
        ),
      ),
    );
  }

  publishToUsers(userIDs: string[], message: RealtimePayload): void {
    const uniqueUserIDs = new Set(userIDs);
    for (const userID of uniqueUserIDs) {
      this.getStream(userID).next({
        type: message.type,
        data: message.payload,
      });
    }
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

  private getStream(userID: string): Subject<MessageEvent> {
    let stream = this.userStreams.get(userID);
    if (!stream) {
      stream = new Subject<MessageEvent>();
      this.userStreams.set(userID, stream);
    }
    return stream;
  }
}
