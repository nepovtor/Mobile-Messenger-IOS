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

  publishMessage(chatID: string, message: Message) {
    const subscribers = this.subscribers.get(chatID);
    if (!subscribers) {
      return;
    }

    const event = this.makeMessageEvent("message", message);

    for (const subscriber of subscribers.values()) {
      subscriber.subject.next(event);
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

  private makeMessageEvent(type: string, data: Chat | Message): MessageEvent {
    return {
      type,
      data,
    };
  }
}
