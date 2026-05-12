import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { normalizePhone } from "../src/modules/common/contact.utils";

test("normalizePhone accepts valid international phone numbers", () => {
  assert.equal(normalizePhone("+375291234567"), "+375291234567");
  assert.equal(normalizePhone("+7 (999) 123-45-67"), "+79991234567");
  assert.equal(normalizePhone("+1 555 123 0011"), "+15551230011");
});

test("normalizePhone rejects invalid phone numbers", () => {
  const invalidPhones = ["12345", "hello", "+000", "+375 29 abc"];

  for (const phone of invalidPhones) {
    assert.throws(
      () => normalizePhone(phone),
      (error: Error | object | string | null) =>
        error instanceof BadRequestException &&
        typeof error.message === "string",
    );
  }
});
