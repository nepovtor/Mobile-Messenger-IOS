import type { IncomingMessage } from "node:http";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "origin",
]);

async function readRequestBody(
  request: IncomingMessage,
): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:8080";

  return {
    plugins: [
      react(),
      {
        name: "local-api-forwarder",
        apply: "serve",
        configureServer(server) {
          server.middlewares.use("/api", async (request, response, next) => {
            try {
              const relativeUrl =
                request.originalUrl ??
                (request.url?.startsWith("/api")
                  ? request.url
                  : `/api${request.url ?? ""}`);
              const targetUrl = new URL(relativeUrl, proxyTarget);
              const body =
                request.method === "GET" || request.method === "HEAD"
                  ? undefined
                  : await readRequestBody(request);
              const headers = new Headers();

              for (const [key, value] of Object.entries(request.headers)) {
                if (!value || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
                  continue;
                }

                headers.set(
                  key,
                  Array.isArray(value) ? value.join(", ") : value,
                );
              }

              const upstreamResponse = await fetch(targetUrl, {
                method: request.method,
                headers,
                body: body ? new Uint8Array(body) : undefined,
              });

              response.statusCode = upstreamResponse.status;

              upstreamResponse.headers.forEach((value, key) => {
                if (
                  HOP_BY_HOP_HEADERS.has(key.toLowerCase()) ||
                  key.toLowerCase().startsWith("access-control-")
                ) {
                  return;
                }

                response.setHeader(key, value);
              });

              response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
            } catch (error) {
              next(error);
            }
          });
        },
      },
    ],
    server: {
      host: "127.0.0.1",
      port: 3000,
      strictPort: true,
      fs: {
        allow: [path.resolve(process.cwd(), "..")],
      },
      proxy: {
        "/realtime": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
          rewriteWsOrigin: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
    },
  };
});
