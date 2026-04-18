import { Injectable, MessageEvent } from "@nestjs/common";
import { Observable, Subject } from "rxjs";
import { finalize } from "rxjs/operators";
import type { Chat, Message } from "./chat.service";

type Subscriber = {
  userID: string;
  subject: Subject<MessageEvent>;
};

@Injectable()
export class ChatEventsService {
  private readonly subscribers = new Map<string, Map<string, Subscriber>>();
  private readonly globalSubscribers = new Map<string, Subscriber>();

  subscribe(
    chatID: string,
    userID: string,
    initialChat: Chat,
  ): Observable<MessageEvent> {
    const subscriptionID = `${userID}_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`;
    const subject = new Subject<MessageEvent>();
    const chatSubscribers = this.subscribers.get(chatID) ?? new Map();

    chatSubscribers.set(subscriptionID, {
      userID,
      subject,
    });
    this.subscribers.set(chatID, chatSubscribers);

    subject.next(
      this.makeMessageEvent("connected", initialChat),
    );

    return subject.asObservable().pipe(
      finalize(() => {
        const currentSubscribers = this.subscribers.get(chatID);
        currentSubscribers?.delete(subscriptionID);
        if (currentSubscribers && currentSubscribers.size === 0) {
          this.subscribers.delete(chatID);
        }
      }),
    );
  }

  subscribeAll(userID: string): Observable<MessageEvent> {
    const subscriptionID = `${userID}_global_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`;
    const subject = new Subject<MessageEvent>();

    this.globalSubscribers.set(subscriptionID, {
      userID,
      subject,
    });

    subject.next({
      type: "keepalive",
      data: { ok: true },
    });

    return subject.asObservable().pipe(
      finalize(() => {
        this.globalSubscribers.delete(subscriptionID);
      }),
    );
  }

  publishMessage(chatID: string, message: Message) {
    const subscribers = this.subscribers.get(chatID);
    const event = this.makeMessageEvent("message", message);

    if (subscribers) {
      for (const subscriber of subscribers.values()) {
        subscriber.subject.next(event);
      }
    }

    for (const subscriber of this.globalSubscribers.values()) {
      subscriber.subject.next({
        type: "message.created",
        data: {
          chatID,
          message,
        },
      });
    }
  }

  async publishChatUpdated(
    chatID: string,
    resolveChatForUser: (userID: string) => Promise<Chat>,
  ) {
    const subscribers = this.subscribers.get(chatID);
    if (!subscribers) {
      return;
    }

    await Promise.all(
      Array.from(subscribers.values()).map(async (subscriber) => {
        const chat = await resolveChatForUser(subscriber.userID);
        subscriber.subject.next(
          this.makeMessageEvent("chatUpdated", chat),
        );
      }),
    );
  }

  publishMessageRead(chatID: string, messageID: string) {
    for (const subscriber of this.globalSubscribers.values()) {
      subscriber.subject.next({
        type: "message.read",
        data: {
          chatID,
          messageID,
        },
      });
    }
  }

  publishTypingChanged(chatID: string, typingParticipants: string[]) {
    for (const subscriber of this.globalSubscribers.values()) {
      subscriber.subject.next({
        type: "typing.changed",
        data: {
          chatID,
          typingParticipants,
        },
      });
    }
  }

  private makeMessageEvent(type: string, data: Chat | Message): MessageEvent {
    return {
      type,
      data,
    };
  }
}
