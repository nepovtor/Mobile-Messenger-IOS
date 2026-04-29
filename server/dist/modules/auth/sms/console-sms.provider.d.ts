import { Logger } from "@nestjs/common";
import { SmsService } from "./sms.types";
export declare class ConsoleSmsProvider implements SmsService {
    private readonly logger;
    constructor(logger: Logger);
    sendVerificationCode(phone: string, code: string): Promise<void>;
}
