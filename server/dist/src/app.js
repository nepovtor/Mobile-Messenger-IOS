"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const express_1 = __importDefault(require("express"));
const app_module_1 = require("./modules/app.module");
async function createApp() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { cors: true });
    app.setGlobalPrefix("api");
    app.use("/api/media/upload", express_1.default.raw({ type: "*/*", limit: "25mb" }));
    app.useGlobalPipes(new common_1.ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
    }));
    return app;
}
//# sourceMappingURL=app.js.map