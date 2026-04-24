import { MessageKind } from "../../../entities/message.entity";
export declare class SendRealtimeMessageDto {
    chatId: string;
    messageID: string;
    kind: MessageKind;
    text?: string;
    mediaID?: string;
}
