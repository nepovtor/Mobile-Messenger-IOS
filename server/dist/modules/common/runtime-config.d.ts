export declare function getNodeEnv(): string;
export declare function isProductionEnv(): boolean;
export declare function readBooleanEnv(name: string, defaultValue: boolean): boolean;
export declare function getJwtSecret(): string;
export declare function isDatabaseSynchronizationEnabled(): boolean;
export declare function areDemoAccountsEnabled(): boolean;
export declare function isPasswordLoginEnabled(): boolean;
export declare function shouldExposeDebugAuthCode(): boolean;
export declare function getCorsOrigins(): string[];
