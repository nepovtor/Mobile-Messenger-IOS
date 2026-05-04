"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const platform_ws_1 = require("@nestjs/platform-ws");
const app_module_1 = require("./modules/app.module");
const runtime_config_1 = require("./modules/common/runtime-config");
const global_exception_filter_1 = require("./modules/common/global-exception.filter");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { cors: false });
    app.useWebSocketAdapter(new platform_ws_1.WsAdapter(app));
    const corsOrigins = (0, runtime_config_1.getCorsOrigins)();
    if (corsOrigins.length > 0) {
        const originValidator = (...args) => {
            const [origin, callback] = args;
            if (!origin || corsOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error("CORS origin is not allowed"), false);
        };
        app.enableCors({
            origin: originValidator,
            credentials: true,
        });
    }
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new common_1.ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
    }));
    app.useGlobalFilters(new global_exception_filter_1.GlobalExceptionFilter());
    const port = process.env.PORT ? Number(process.env.PORT) : 8080;
    await app.listen(port, "0.0.0.0");
    console.log(`API is ready on http://localhost:${port}/api with ${corsOrigins.length} CORS origin(s)`);
}
bootstrap();
//# sourceMappingURL=main.js.map