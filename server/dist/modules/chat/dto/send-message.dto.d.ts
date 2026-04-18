import { MessageKind } from "../../../entities/message.entity";
export declare class SendMessageDto {
    messageID: string;
    kind: MessageKind;
    text?: string;
    mediaID?: string;
}
