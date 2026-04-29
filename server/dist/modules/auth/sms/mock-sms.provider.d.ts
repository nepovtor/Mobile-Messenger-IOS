import { SmsService } from "./sms.types";
export declare class MockSmsProvider implements SmsService {
    readonly sentMessages: Array<{
        phone: string;
        code: string;
    }>;
    sendVerificationCode(phone: string, code: string): Promise<void>;
}
