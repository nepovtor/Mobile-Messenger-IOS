"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocsController = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
let DocsController = class DocsController {
    renderLanding(request) {
        const pkg = this.readPackageInfo();
        const protocol = request.protocol || "http";
        const host = request.get("host") || `localhost:${process.env.PORT || "8080"}`;
        const baseUrl = `${protocol}://${host}/api`;
        return buildLandingPage({
            appName: pkg.name ?? "mobile-messenger-backend",
            version: pkg.version ?? "0.0.0",
            baseUrl,
        });
    }
    readPackageInfo() {
        const pkgPath = path.join(__dirname, "..", "..", "..", "package.json");
        const pkgRaw = fs.readFileSync(pkgPath, "utf-8");
        return JSON.parse(pkgRaw);
    }
};
exports.DocsController = DocsController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.Header)("Content-Type", "text/html; charset=utf-8"),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", String)
], DocsController.prototype, "renderLanding", null);
exports.DocsController = DocsController = __decorate([
    (0, common_1.Controller)()
], DocsController);
function buildLandingPage(input) {
    const publicEndpoints = [
        {
            method: "GET",
            path: "/health",
            description: "Проверка, что backend поднялся и отвечает.",
        },
        {
            method: "GET",
            path: "/version",
            description: "Имя сервиса и текущая версия сборки.",
        },
        {
            method: "POST",
            path: "/auth/request",
            description: "Запрос одноразового кода подтверждения для входа.",
        },
        {
            method: "POST",
            path: "/auth/verify",
            description: "Подтверждение кода и получение JWT-сессии.",
        },
        {
            method: "POST",
            path: "/auth/login",
            description: "Вход по demo-паролю для локальной разработки.",
        },
    ];
    const protectedEndpoints = [
        {
            method: "GET",
            path: "/auth/me",
            description: "Профиль текущего пользователя.",
            auth: "bearer",
        },
        {
            method: "GET",
            path: "/auth/contacts",
            description: "Контакты и demo-аккаунты, доступные для чатов.",
            auth: "bearer",
        },
        {
            method: "GET",
            path: "/chats",
            description: "Список чатов, поиск и последние активности.",
            auth: "bearer",
        },
        {
            method: "POST",
            path: "/chats",
            description: "Создание нового диалога или группового чата.",
            auth: "bearer",
        },
        {
            method: "GET",
            path: "/chats/:chatID/messages",
            description: "История сообщений с пагинацией.",
            auth: "bearer",
        },
        {
            method: "POST",
            path: "/chats/:chatID/messages",
            description: "Отправка текстового или image-сообщения.",
            auth: "bearer",
        },
        {
            method: "POST",
            path: "/chats/:chatID/messages/:messageID/read",
            description: "Подтверждение прочтения сообщения.",
            auth: "bearer",
        },
        {
            method: "POST",
            path: "/chats/:chatID/typing",
            description: "Обновление статуса набора текста.",
            auth: "bearer",
        },
        {
            method: "WS",
            path: "/realtime",
            description: "Основной native WebSocket realtime для connection.ready, message.send, message.created, typing и read.",
            auth: "bearer",
        },
        {
            method: "GET",
            path: "/realtime/events",
            description: "Legacy SSE-поток для обратной совместимости. Не является основным realtime.",
            auth: "bearer",
        },
        {
            method: "POST",
            path: "/media/upload-url",
            description: "Получение presigned URL для загрузки изображений.",
            auth: "bearer",
        },
        {
            method: "POST",
            path: "/media/:mediaID/confirm",
            description: "Подтверждение успешной загрузки медиафайла.",
            auth: "bearer",
        },
    ];
    const quickChecks = [
        `curl ${escapeHtml(`${input.baseUrl}/health`)}`,
        `curl ${escapeHtml(`${input.baseUrl}/version`)}`,
        `curl -X POST ${escapeHtml(`${input.baseUrl}/auth/login`)}`,
    ];
    return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.appName)} API</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f8ff;
        --ink: #10213f;
        --muted: #5d6f93;
        --card: rgba(255, 255, 255, 0.82);
        --stroke: rgba(74, 110, 181, 0.16);
        --blue: #346dff;
        --blue-dark: #1f51d8;
        --shadow: 0 28px 70px rgba(31, 63, 123, 0.14);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(111, 162, 255, 0.28), transparent 28rem),
          radial-gradient(circle at top right, rgba(55, 208, 164, 0.12), transparent 24rem),
          linear-gradient(180deg, #f8fbff 0%, var(--bg) 44%, #eef4ff 100%);
      }

      .shell {
        width: min(1140px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }

      .hero {
        position: relative;
        overflow: hidden;
        padding: 34px;
        border-radius: 32px;
        background:
          linear-gradient(135deg, rgba(40, 87, 205, 0.96), rgba(72, 132, 255, 0.92)),
          linear-gradient(180deg, #2f66f0, #5794ff);
        color: white;
        box-shadow: var(--shadow);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 8px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.14);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 18px 0 12px;
        font-size: clamp(34px, 5vw, 58px);
        line-height: 0.95;
      }

      .lead {
        max-width: 760px;
        margin: 0;
        font-size: 18px;
        line-height: 1.65;
        color: rgba(255, 255, 255, 0.88);
      }

      .hero-grid,
      .grid {
        display: grid;
        gap: 18px;
      }

      .hero-grid {
        margin-top: 28px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }

      .grid {
        margin-top: 22px;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }

      .card {
        padding: 22px;
        border-radius: 24px;
        background: var(--card);
        border: 1px solid var(--stroke);
        backdrop-filter: blur(14px);
        box-shadow: 0 18px 42px rgba(50, 74, 121, 0.08);
      }

      .card h2 {
        margin: 0 0 12px;
      }

      .metric {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.78);
      }

      .metric-value {
        margin-top: 10px;
        font-size: 20px;
        font-weight: 700;
      }

      .section-title {
        margin: 0 0 10px;
        font-size: 24px;
      }

      .section-copy {
        margin: 0;
        color: var(--muted);
        line-height: 1.7;
      }

      .endpoint-list {
        display: grid;
        gap: 14px;
        margin-top: 18px;
      }

      .endpoint {
        display: grid;
        gap: 10px;
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid rgba(75, 107, 177, 0.12);
        background: rgba(255, 255, 255, 0.74);
      }

      .endpoint-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
      }

      .method {
        display: inline-flex;
        min-width: 58px;
        justify-content: center;
        padding: 7px 11px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: white;
        background: linear-gradient(135deg, var(--blue), var(--blue-dark));
      }

      .method.get {
        background: linear-gradient(135deg, #0f9b77, #17bf90);
      }

      .path {
        font-family: "SFMono-Regular", "Menlo", monospace;
        font-size: 14px;
      }

      .pill {
        margin-left: auto;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        color: var(--blue-dark);
        background: rgba(52, 109, 255, 0.1);
      }

      .endpoint p,
      li {
        margin: 0;
        color: var(--muted);
        line-height: 1.65;
      }

      code,
      pre {
        font-family: "SFMono-Regular", "Menlo", monospace;
      }

      pre {
        margin: 0;
        overflow-x: auto;
        padding: 16px 18px;
        border-radius: 18px;
        background: #0f1730;
        color: #d8e4ff;
      }

      .stack {
        display: grid;
        gap: 14px;
      }

      .list {
        padding-left: 18px;
      }

      .footer {
        margin-top: 24px;
        text-align: center;
        color: var(--muted);
        font-size: 14px;
      }

      a {
        color: inherit;
      }

      @media (max-width: 720px) {
        .shell {
          width: min(100% - 20px, 1140px);
          padding-top: 20px;
        }

        .hero,
        .card {
          padding: 20px;
        }

        .pill {
          margin-left: 0;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="eyebrow">Mobile Messenger API</div>
        <h1>Локальный backend для iOS-мессенджера</h1>
        <p class="lead">
          Здесь живут авторизация, список контактов, чаты, история сообщений,
          realtime-события и загрузка изображений. Этот сервис нужен для
          локальной интеграции iOS-клиента и быстрой проверки всех основных
          сценариев мессенджера.
        </p>

        <div class="hero-grid">
          <div>
            <div class="metric">Base URL</div>
            <div class="metric-value">${escapeHtml(input.baseUrl)}</div>
          </div>
          <div>
            <div class="metric">Version</div>
            <div class="metric-value">${escapeHtml(input.version)}</div>
          </div>
          <div>
            <div class="metric">Runtime</div>
            <div class="metric-value">NestJS + PostgreSQL + MinIO</div>
          </div>
        </div>
      </section>

      <section class="grid">
        <article class="card">
          <h2 class="section-title">Что уже есть</h2>
          <p class="section-copy">
            Backend покрывает demo-логин, выдачу JWT, список контактов, создание
            чатов, текстовые сообщения, image upload через presigned URL и
            realtime-обновления по SSE.
          </p>
        </article>
        <article class="card">
          <h2 class="section-title">Как подключать iPhone</h2>
          <p class="section-copy">
            В симуляторе используйте <code>127.0.0.1</code>. На реальном телефоне
            вместо localhost нужен IP вашего Mac в той же Wi-Fi сети, например
            <code>http://192.168.0.24:8080/api</code>.
          </p>
        </article>
        <article class="card">
          <h2 class="section-title">Demo-аккаунты</h2>
          <p class="section-copy">
            Быстрый локальный вход:
            <br /><code>+15551230011 / demo1111</code>
            <br /><code>+15551230012 / demo2222</code>
            <br /><code>+15551230013 / demo3333</code>
          </p>
        </article>
      </section>

      <section class="grid">
        <article class="card">
          <h2 class="section-title">Public endpoints</h2>
          <div class="endpoint-list">
            ${publicEndpoints.map((endpoint) => renderEndpoint(endpoint)).join("")}
          </div>
        </article>
        <article class="card">
          <h2 class="section-title">Authorized endpoints</h2>
          <div class="endpoint-list">
            ${protectedEndpoints
        .map((endpoint) => renderEndpoint(endpoint))
        .join("")}
          </div>
        </article>
      </section>

      <section class="grid">
        <article class="card stack">
          <h2 class="section-title">Быстрая проверка</h2>
          <p class="section-copy">
            Если backend уже поднят, этих команд обычно хватает, чтобы увидеть,
            что API отвечает и готово к интеграции.
          </p>
          ${quickChecks.map((command) => `<pre>${command}</pre>`).join("")}
        </article>
        <article class="card stack">
          <h2 class="section-title">Что умеет этот API</h2>
          <ul class="list">
            <li>Авторизация по demo-паролю или одноразовому коду.</li>
            <li>Получение списка чатов с поиском и последней активностью.</li>
            <li>Загрузка истории сообщений с пагинацией.</li>
            <li>Realtime-обновления через Server-Sent Events.</li>
            <li>Подготовка и подтверждение image upload в MinIO/S3.</li>
          </ul>
        </article>
      </section>

      <p class="footer">
        ${escapeHtml(input.appName)} v${escapeHtml(input.version)} ·
        <a href="${escapeHtml(`${input.baseUrl}/health`)}">health</a> ·
        <a href="${escapeHtml(`${input.baseUrl}/version`)}">version</a>
      </p>
    </main>
  </body>
</html>`;
}
function renderEndpoint(endpoint) {
    const authLabel = endpoint.auth === "bearer" ? '<span class="pill">Bearer token</span>' : "";
    const methodClass = endpoint.method.toLowerCase();
    return `<article class="endpoint">
    <div class="endpoint-head">
      <span class="method ${escapeHtml(methodClass)}">${escapeHtml(endpoint.method)}</span>
      <code class="path">${escapeHtml(endpoint.path)}</code>
      ${authLabel}
    </div>
    <p>${escapeHtml(endpoint.description)}</p>
  </article>`;
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
//# sourceMappingURL=docs.controller.js.map