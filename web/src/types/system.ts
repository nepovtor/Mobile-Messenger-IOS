export type SystemLogEntry = {
  timestamp: string;
  level: "info" | "warn" | "error";
  kind: "app" | "request" | "error";
  context: string;
  message: string;
  meta: Record<string, unknown> | null;
};

export type SystemOverview = {
  generatedAt: string;
  api: {
    name: string;
    version: string;
    environment: string;
    nodeVersion: string;
    uptimeSeconds: number;
    basePath: string;
  };
  typescript: {
    backendEnabled: boolean;
    strict: string | boolean | null;
    target: string | boolean | null;
    module: string | boolean | null;
  };
  logging: {
    directory: string;
    appFile: string;
    requestFile: string;
    errorFile: string;
  };
  docker: {
    rootDockerfilePresent: boolean;
    serverDockerfilePresent: boolean;
    composeFilePresent: boolean;
  };
  database: {
    driver: string;
    orm: string;
    connected: boolean;
    host: string;
    port: number;
    name: string;
    synchronize: boolean;
    counts: {
      users: number;
      contacts: number;
      chats: number;
      messages: number;
      sharedLocations: number;
    };
    recentUsers: Array<{
      id: string;
      displayName: string;
      contact: string;
      phone: string | null;
      createdAt: string;
    }>;
    recentChats: Array<{
      id: string;
      title: string;
      lastMessagePreview: string | null;
      lastActivity: string;
      createdAt: string;
    }>;
    recentMessages: Array<{
      id: string;
      chatID: string;
      chatTitle: string | null;
      authorName: string;
      kind: string;
      status: string;
      preview: string;
      createdAt: string;
    }>;
  };
  authentication: {
    jwtConfigured: boolean;
    jwtExpiresIn: string;
    bearerScheme: string;
    adminConsoleEnabled: boolean;
    adminLogin: string;
    verificationProvider: string;
    smsProvider: string;
    demoAccountsEnabled: boolean;
    passwordLoginEnabled: boolean;
    protectedRoutes: string[];
  };
  storage: {
    endpoint: string | null;
    bucket: string | null;
    configured: boolean;
  };
};

export type BackendVersionInfo = {
  name: string;
  version: string;
};

export type BackendHealthInfo = {
  status: string;
  uptime: number;
  timestamp: string;
};
