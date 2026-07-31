import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseConsoleSmsInCurrentEnv,
  getAuthCodeMaxAttempts,
  getAuthCodeResendCooldownSeconds,
  getAuthCodeTTLSeconds,
  getAuthTestCode,
  getCookieSameSite,
  getCorsOrigins,
  getJwtAccessCurrentKeyId,
  getJwtAccessPreviousKeyId,
  getJwtAccessPreviousSecret,
  getJwtAccessTokenExpiresIn,
  getJwtAudience,
  getJwtIssuer,
  getJwtRefreshTokenExpiresIn,
  getJwtSecret,
  getLogIpHashKey,
  getOtpPepper,
  getRefreshTokenPepper,
  getS3Bucket,
  getS3Endpoint,
  getS3PublicEndpoint,
  getTelegramBotToken,
  getTelegramBotUsername,
  getTelegramLinkResendCooldownSeconds,
  getTelegramPairingTokenTTLSeconds,
  getTelegramSubscriptionAppUrl,
  getSmsProvider,
  getTwilioConfig,
  getVerificationProvider,
  getWebAppUrl,
  getWebSocketOrigins,
  hasTelegramBotConfig,
  isAdminIpAllowlistEnabled,
  isCookieSecure,
  isE2EEEnabled,
  isE2EERequired,
  isLegacyMessagesReadEnabled,
  isPasswordLoginEnabled,
  isTelegramOwnContactRequired,
  isTelegramRelinkAllowed,
  isTelegramTextPhoneLinkingAllowed,
  parseDurationSeconds,
  parseOriginAllowlist,
  readBooleanEnv,
  validateRuntimeConfig,
} from "../src/modules/common/runtime-config";

const VALID_PRODUCTION_ENV: Record<string, string> = {
  NODE_ENV: "production",
  JWT_ACCESS_CURRENT_KEY_ID: "access-2026-07",
  JWT_ACCESS_CURRENT_SECRET: "A".repeat(48),
  JWT_ACCESS_PREVIOUS_KEY_ID: "access-2026-06",
  JWT_ACCESS_PREVIOUS_SECRET: "B".repeat(48),
  JWT_ISSUER: "https://api.example.test",
  JWT_AUDIENCE: "mobile-messenger",
  JWT_ACCESS_EXPIRES_IN: "10m",
  JWT_REFRESH_EXPIRES_IN: "30d",
  OTP_PEPPER: "C".repeat(48),
  REFRESH_TOKEN_PEPPER: "D".repeat(48),
  LOG_IP_HASH_KEY: "E".repeat(48),
  CORS_ORIGINS: "https://app.example.test",
  WS_ORIGINS: "https://app.example.test",
  S3_ENDPOINT: "https://storage.example.test",
  S3_ACCESS_KEY: "production-access-key",
  S3_SECRET_KEY: "F".repeat(48),
  S3_BUCKET: "messenger-private",
  S3_REGION: "eu-central-1",
  S3_TLS_ENABLED: "true",
  E2EE_ENABLED: "true",
  E2EE_REQUIRED: "true",
  DB_SYNCHRONIZE: "false",
  AUTH_ENABLE_DEMO_ACCOUNTS: "false",
  AUTH_ALLOW_TEST_CODE: "false",
  COOKIE_SECURE: "true",
};

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

test("getJwtSecret throws when no current JWT secret is configured", () => {
  withEnv(
    {
      JWT_ACCESS_CURRENT_SECRET: undefined,
      JWT_SECRET_KEY: undefined,
      JWT_SECRET: undefined,
    },
    () => {
      assert.throws(
        () => getJwtSecret(),
        /JWT_ACCESS_CURRENT_SECRET.*JWT_SECRET/,
      );
    },
  );
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

test("duration parser and short-lived token defaults are deterministic", () => {
  withEnv(
    {
      NODE_ENV: "development",
      JWT_ACCESS_EXPIRES_IN: undefined,
      JWT_EXPIRES_IN: undefined,
      JWT_REFRESH_EXPIRES_IN: undefined,
    },
    () => {
      assert.equal(parseDurationSeconds("10m"), 600);
      assert.equal(parseDurationSeconds("30d"), 2_592_000);
      assert.equal(parseDurationSeconds("10 minutes"), null);
      assert.equal(getJwtAccessTokenExpiresIn(), "10m");
      assert.equal(getJwtRefreshTokenExpiresIn(), "30d");
    },
  );
});

test("security feature flags and cookie settings use explicit configuration", () => {
  withEnv(
    {
      NODE_ENV: "production",
      PASSWORD_LOGIN_ENABLED: "false",
      E2EE_ENABLED: "true",
      E2EE_REQUIRED: "true",
      LEGACY_MESSAGES_READ_ENABLED: "false",
      ADMIN_IP_ALLOWLIST_ENABLED: "true",
      COOKIE_SECURE: "true",
      COOKIE_SAME_SITE: "lax",
    },
    () => {
      assert.equal(isPasswordLoginEnabled(), false);
      assert.equal(isE2EEEnabled(), true);
      assert.equal(isE2EERequired(), true);
      assert.equal(isLegacyMessagesReadEnabled(), false);
      assert.equal(isAdminIpAllowlistEnabled(), true);
      assert.equal(isCookieSecure(), true);
      assert.equal(getCookieSameSite(), "lax");
    },
  );
});

test("origin allowlists reject wildcards, paths and insecure production origins", () => {
  assert.throws(
    () =>
      parseOriginAllowlist("*", {
        variableName: "CORS_ORIGINS",
      }),
    /wildcard origins are forbidden/,
  );
  assert.throws(
    () =>
      parseOriginAllowlist("https://app.example.test/path", {
        variableName: "CORS_ORIGINS",
      }),
    /invalid origin/,
  );
  assert.throws(
    () =>
      parseOriginAllowlist("http://app.example.test", {
        variableName: "CORS_ORIGINS",
        requireHttps: true,
      }),
    /only https origins/,
  );
  assert.deepEqual(
    parseOriginAllowlist(
      "https://app.example.test, https://app.example.test/",
      {
        variableName: "CORS_ORIGINS",
        requireHttps: true,
      },
    ),
    ["https://app.example.test"],
  );
});

test("production JWT getters ignore legacy aliases", () => {
  withEnv(
    {
      NODE_ENV: "production",
      JWT_ACCESS_CURRENT_KEY_ID: undefined,
      JWT_ACCESS_CURRENT_SECRET: undefined,
      JWT_ACCESS_PREVIOUS_KEY_ID: undefined,
      JWT_ACCESS_PREVIOUS_SECRET: undefined,
      JWT_ACCESS_CURRENT_KID: "legacy-current",
      JWT_SECRET_KEY: "G".repeat(48),
      JWT_SECRET: "H".repeat(48),
      JWT_ACCESS_PREVIOUS_KID: "legacy-previous",
      JWT_PREVIOUS_SECRET: "I".repeat(48),
    },
    () => {
      assert.equal(getJwtAccessCurrentKeyId(), "legacy");
      assert.equal(getJwtAccessPreviousKeyId(), null);
      assert.equal(getJwtAccessPreviousSecret(), null);
      assert.throws(() => getJwtSecret(), /JWT_ACCESS_CURRENT_SECRET/);
    },
  );
});

test("production runtime validation accepts a complete hardened configuration", () => {
  withEnv(VALID_PRODUCTION_ENV, () => {
    assert.doesNotThrow(() => validateRuntimeConfig());
    assert.equal(getJwtAccessCurrentKeyId(), "access-2026-07");
    assert.equal(getJwtAccessPreviousKeyId(), "access-2026-06");
    assert.equal(getJwtIssuer(), "https://api.example.test");
    assert.equal(getJwtAudience(), "mobile-messenger");
    assert.equal(getOtpPepper(), "C".repeat(48));
    assert.equal(getRefreshTokenPepper(), "D".repeat(48));
    assert.equal(getLogIpHashKey(), "E".repeat(48));
    assert.deepEqual(getWebSocketOrigins(), ["https://app.example.test"]);
  });
});

test("production runtime validation fails closed for missing or unsafe inputs", () => {
  const unsafeCases: Array<{
    expected: RegExp;
    updates: Record<string, string | undefined>;
  }> = [
    {
      updates: { JWT_ACCESS_PREVIOUS_SECRET: undefined },
      expected: /JWT_ACCESS_PREVIOUS_SECRET is required/,
    },
    {
      updates: { REFRESH_TOKEN_PEPPER: undefined },
      expected: /REFRESH_TOKEN_PEPPER is required/,
    },
    {
      updates: { CORS_ORIGINS: "*" },
      expected: /wildcard origins are forbidden/,
    },
    {
      updates: { WS_ORIGINS: undefined },
      expected: /WS_ORIGINS must contain at least one/,
    },
    {
      updates: {
        S3_ENDPOINT: "http://storage.example.test",
        S3_TLS_ENABLED: "false",
      },
      expected: /S3_TLS_ENABLED must be true/,
    },
    {
      updates: { E2EE_REQUIRED: "false" },
      expected: /E2EE_REQUIRED must be true/,
    },
  ];

  for (const { expected, updates } of unsafeCases) {
    withEnv({ ...VALID_PRODUCTION_ENV, ...updates }, () => {
      assert.throws(() => validateRuntimeConfig(), expected);
    });
  }
});
