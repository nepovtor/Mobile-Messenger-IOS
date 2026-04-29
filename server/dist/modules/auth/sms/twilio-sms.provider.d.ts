import { Logger } from "@nestjs/common";
import { SmsService } from "./sms.types";
type TwilioConfig = {
    accountSID: string;
    authToken: string;
    from: string;
};
export declare class TwilioSmsProvider implements SmsService {
    private readonly config;
    private readonly logger;
    constructor(config: TwilioConfig, logger: Logger);
    sendVerificationCode(phone: string, code: string): Promise<void>;
}
export {};
