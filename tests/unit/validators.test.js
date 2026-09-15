import test from "node:test";
import assert from "node:assert/strict";

import { isValidEmail, passwordsMatch } from "../../storefront/js/utils/validators.js";

test("isValidEmail accepts a normal email address", () => {
  assert.equal(isValidEmail("customer@example.com"), true);
});

test("isValidEmail rejects missing or malformed email addresses", () => {
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("customer@"), false);
  assert.equal(isValidEmail("customer.example.com"), false);
  assert.equal(isValidEmail("customer @example.com"), false);
});

test("isValidEmail trims surrounding whitespace", () => {
  assert.equal(isValidEmail("  customer@example.com  "), true);
});

test("passwordsMatch returns true only for identical values", () => {
  assert.equal(passwordsMatch("secret123", "secret123"), true);
  assert.equal(passwordsMatch("secret123", "Secret123"), false);
  assert.equal(passwordsMatch("secret123", "secret1234"), false);
});
