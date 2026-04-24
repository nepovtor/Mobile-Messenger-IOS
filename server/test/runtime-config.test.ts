import assert from "node:assert/strict";
import test from "node:test";
import {
  getCorsOrigins,
  getJwtSecret,
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
    ]);
  });
});
