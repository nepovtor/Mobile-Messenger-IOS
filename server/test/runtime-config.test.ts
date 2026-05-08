import assert from "node:assert/strict";
import test from "node:test";
import {
  getAdminPassword,
  canUseConsoleSmsInCurrentEnv,
  getAuthCodeMaxAttempts,
  getAuthCodeResendCooldownSeconds,
  getAuthCodeTTLSeconds,
  getAuthTestCode,
  getCorsOrigins,
  getJwtSecret,
  getS3Bucket,
  getS3Endpoint,
  getS3PublicEndpoint,
  getTelegramLinkResendCooldownSeconds,
  getTelegramBotToken,
  getTelegramBotUsername,
  getTelegramPairingTokenTTLSeconds,
  getTelegramSubscriptionAppUrl,
  getWebAppUrl,
  getVerificationProvider,
  getSmsProvider,
  getTwilioConfig,
  hasTelegramBotConfig,
  isTelegramOwnContactRequired,
  isTelegramRelinkAllowed,
  isTelegramTextPhoneLinkingAllowed,
  readBooleanEnv,
} from "../src/modules/common/runtime-config";

function withEnv(
  updates: Record<string, string | undefined>,
  run: () => void,
): void {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("readBooleanEnv accepts explicit truthy values and falls back to defaults", () => {
  withEnv({ FEATURE_FLAG: "yes" }, () => {
    assert.equal(readBooleanEnv("FEATURE_FLAG", false), true);
  });

  withEnv({ FEATURE_FLAG: "0" }, () => {
    assert.equal(readBooleanEnv("FEATURE_FLAG", true), false);
  });

  withEnv({ FEATURE_FLAG: undefined }, () => {
    assert.equal(readBooleanEnv("FEATURE_FLAG", true), true);
  });
});

test("getJwtSecret throws when JWT_SECRET is not configured", () => {
  withEnv({ JWT_SECRET: undefined }, () => {
    assert.throws(
      () => getJwtSecret(),
      /JWT_SECRET environment variable is required/,
    );
  });
});

test("getCorsOrigins prefers configured origins with whitespace trimmed", () => {
  withEnv(
    {
      NODE_ENV: "production",
      CORS_ORIGINS: " https://app.example.com , https://admin.example.com ",
    },
    () => {
      assert.deepEqual(getCorsOrigins(), [
        "https://app.example.com",
        "https://admin.example.com",
      ]);
    },
  );
});

test("getCorsOrigins returns safe defaults by environment", () => {
  withEnv({ NODE_ENV: "production", CORS_ORIGINS: undefined }, () => {
    assert.deepEqual(getCorsOrigins(), []);
  });

  withEnv({ NODE_ENV: "development", CORS_ORIGINS: undefined }, () => {
    assert.deepEqual(getCorsOrigins(), [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);
  });
});

test("getWebAppUrl falls back to the local web app in development", () => {
  withEnv(
    {
      NODE_ENV: "development",
      WEB_APP_URL: undefined,
      PUBLIC_WEB_URL: undefined,
    },
    () => {
      assert.equal(getWebAppUrl(), "http://127.0.0.1:3000");
    },
  );
});

test("S3 endpoint config trims values and public endpoint falls back to internal", () => {
  withEnv(
    {
      S3_ENDPOINT: "https://internal-storage.example.test/",
      S3_PUBLIC_ENDPOINT: undefined,
      S3_BUCKET: " messenger-media ",
    },
    () => {
      assert.equal(getS3Endpoint(), "https://internal-storage.example.test");
      assert.equal(
        getS3PublicEndpoint(),
        "https://internal-storage.example.test",
      );
      assert.equal(getS3Bucket(), "messenger-media");
    },
  );

  withEnv(
    {
      S3_ENDPOINT: "https://internal-storage.example.test/",
      S3_PUBLIC_ENDPOINT: "https://cdn.example.test/",
    },
    () => {
      assert.equal(getS3PublicEndpoint(), "https://cdn.example.test");
    },
  );
});

test("auth code config falls back to safe defaults", () => {
  withEnv(
    {
      AUTH_TEST_CODE: undefined,
      AUTH_CODE_TTL_SECONDS: undefined,
      AUTH_CODE_MAX_ATTEMPTS: undefined,
      AUTH_CODE_RESEND_COOLDOWN_SECONDS: undefined,
    },
    () => {
      assert.equal(getAuthTestCode(), "123456");
      assert.equal(getAuthCodeTTLSeconds(), 300);
      assert.equal(getAuthCodeMaxAttempts(), 5);
      assert.equal(getAuthCodeResendCooldownSeconds(), 60);
    },
  );
});

test("sms provider config reads twilio credentials and production guard", () => {
  withEnv(
    {
      NODE_ENV: "production",
      SMS_PROVIDER: "twilio",
      SMS_TWILIO_ACCOUNT_SID: "AC123",
      SMS_TWILIO_AUTH_TOKEN: "secret",
      SMS_TWILIO_FROM: "+15550001111",
      AUTH_ALLOW_TEST_CODE: "false",
    },
    () => {
      assert.equal(getSmsProvider(), "twilio");
      assert.deepEqual(getTwilioConfig(), {
        accountSID: "AC123",
        authToken: "secret",
        from: "+15550001111",
      });
      assert.equal(canUseConsoleSmsInCurrentEnv(), false);
    },
  );
});

test("verification provider reads telegram config", () => {
  withEnv(
    {
      VERIFICATION_PROVIDER: "telegram",
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_BOT_USERNAME: "@mobile_demo_bot",
      TELEGRAM_ALLOW_TEXT_PHONE_LINKING: "true",
      TELEGRAM_REQUIRE_OWN_CONTACT: "true",
      TELEGRAM_PAIRING_TOKEN_TTL_SECONDS: "600",
      TELEGRAM_LINK_RESEND_COOLDOWN_SECONDS: "60",
      TELEGRAM_ALLOW_RELINK: "false",
    },
    () => {
      assert.equal(getVerificationProvider(), "telegram");
      assert.equal(getTelegramBotToken(), "bot-token");
      assert.equal(getTelegramBotUsername(), "mobile_demo_bot");
      assert.equal(hasTelegramBotConfig(), true);
      assert.equal(isTelegramTextPhoneLinkingAllowed(), true);
      assert.equal(isTelegramOwnContactRequired(), true);
      assert.equal(getTelegramPairingTokenTTLSeconds(), 600);
      assert.equal(getTelegramLinkResendCooldownSeconds(), 60);
      assert.equal(isTelegramRelinkAllowed(), false);
    },
  );
});

test("admin password falls back to demo credentials when demo mode is enabled", () => {
  withEnv(
    {
      NODE_ENV: "production",
      ADMIN_PASSWORD: undefined,
      AUTH_ENABLE_DEMO_ACCOUNTS: "true",
    },
    () => {
      assert.equal(getAdminPassword(), "admin");
    },
  );

  withEnv(
    {
      NODE_ENV: "production",
      ADMIN_PASSWORD: undefined,
      AUTH_ENABLE_DEMO_ACCOUNTS: "false",
    },
    () => {
      assert.equal(getAdminPassword(), null);
    },
  );
});

test("telegram subscription app URL is derived from web app URL", () => {
  withEnv(
    {
      WEB_APP_URL: "https://demo.example.com/",
      PUBLIC_WEB_URL: undefined,
    },
    () => {
      assert.equal(getWebAppUrl(), "https://demo.example.com");
      assert.equal(
        getTelegramSubscriptionAppUrl("team"),
        "https://demo.example.com/telegram/subscription?source=telegram-bot&plan=team",
      );
    },
  );
});
