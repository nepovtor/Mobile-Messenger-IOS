import { Controller, Get } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";

@Controller("version")
export class VersionController {
  @Get()
  getVersion() {
    const pkgPath = path.join(__dirname, "..", "..", "..", "package.json");
    const pkgRaw = fs.readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgRaw) as { version?: string; name?: string };

    return {
      name: pkg.name ?? "mobile-messenger-backend",
      version: pkg.version ?? "0.0.0",
    };
  }
}
