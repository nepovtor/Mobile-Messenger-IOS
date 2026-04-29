import { Logger } from "@nestjs/common";
import { SmsService } from "./sms.types";
export declare class UnavailableSmsProvider implements SmsService {
    private readonly logger;
    private readonly reason;
    constructor(logger: Logger, reason: string);
    sendVerificationCode(phone: string): Promise<void>;
}
