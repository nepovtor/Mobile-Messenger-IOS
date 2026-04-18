import { MessageKind } from "../../../entities/message.entity";
export declare class SendRealtimeMessageDto {
    messageID: string;
    kind: MessageKind;
    text?: string;
    mediaID?: string;
}
