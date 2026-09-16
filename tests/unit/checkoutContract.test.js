import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const checkoutSource = await readFile(
  new URL("../../storefront/js/pages/checkout.js", import.meta.url),
  "utf8",
);

 test("checkout does not remove cart items before payment succeeds", () => {
  assert.doesNotMatch(
    checkoutSource,
    /removeCartItems\s*\(/,
    "checkout must leave cart removal to the successful-payment boundary",
  );
});

test("checkout keeps a remembered order so an active reservation can be resumed", () => {
  assert.match(checkoutSource, /rememberCheckoutOrder\(pendingOrderId\)/);
  assert.match(checkoutSource, /findRememberedCheckoutOrder/);
});
