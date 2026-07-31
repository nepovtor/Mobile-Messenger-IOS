import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("push service worker privacy", () => {
  it("always uses generic copy and never reads server message content", () => {
    const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

    expect(source).toContain(
      'self.registration.showNotification("Новое сообщение", options)',
    );
    expect(source).not.toMatch(/payload\.(?:title|body)/);
    expect(source).not.toContain("event.data.text");
  });
});
