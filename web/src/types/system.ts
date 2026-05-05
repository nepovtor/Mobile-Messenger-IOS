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
  };
  authentication: {
    jwtConfigured: boolean;
    jwtExpiresIn: string;
    bearerScheme: string;
    protectedRoutes: string[];
  };
};
