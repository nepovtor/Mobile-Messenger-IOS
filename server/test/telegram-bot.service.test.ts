import assert from "node:assert/strict";
import test from "node:test";
import { TelegramBotService } from "../src/modules/auth/telegram/telegram-bot.service";

type TelegramServiceProbe = {
  logger: {
    warn: (message: string) => void;
    error: (
      ...args: Array<object | string | number | boolean | null | undefined>
    ) => void;
  };
  polling: boolean;
  pollingTimer: NodeJS.Timeout | null;
  pollOnce: () => Promise<void>;
};

function withEnv(
  updates: Record<string, string | undefined>,
  run: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return run().finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("Telegram polling stops cleanly after a getUpdates 409 conflict", async () => {
  const originalFetch = global.fetch;
  const warnings: string[] = [];
  const errors: Array<
    Array<object | string | number | boolean | null | undefined>
  > = [];

  try {
    global.fetch = async () =>
      ({
        ok: false,
        status: 409,
        text: async () =>
          '{"ok":false,"error_code":409,"description":"Conflict: terminated by other getUpdates request"}',
      }) as Response;

    await withEnv(
      {
        TELEGRAM_BOT_TOKEN: "bot-token",
      },
      async () => {
        const service = new TelegramBotService(
          {} as never,
          {} as never,
          {} as never,
        );
        const serviceState = service as object as TelegramServiceProbe;

        serviceState.logger = {
          warn: (message: string) => {
            warnings.push(message);
          },
          error: (
            ...args: Array<
              object | string | number | boolean | null | undefined
            >
          ) => {
            errors.push(args);
          },
        };

        serviceState.polling = true;
        await serviceState.pollOnce();

        assert.equal(serviceState.polling, false);
        assert.equal(serviceState.pollingTimer, null);
        assert.equal(errors.length, 0);
        assert.deepEqual(warnings, [
          "Telegram polling stopped because another bot instance already uses getUpdates for this token.",
        ]);
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});
