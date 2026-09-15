import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bridgeSource = await readFile(
  new URL("../../storefront/js/services/checkoutStateBridge.js", import.meta.url),
  "utf8",
);
const checkoutSource = await readFile(
  new URL("../../storefront/js/pages/checkout.js", import.meta.url),
  "utf8",
);

test("explicit cart selections clear older remembered checkout orders", () => {
  assert.match(bridgeSource, /const hasExplicitCartSelection = params\.get\("items"\)\?\.trim\(\)/);
  assert.match(bridgeSource, /if \(hasExplicitCartSelection\)/);
  assert.match(bridgeSource, /localStorage\.removeItem\(CHECKOUT_ORDER_KEY\)/);
});

test("explicit order links store only a checkout locator", () => {
  assert.match(bridgeSource, /const explicitOrderId = params\.get\("order"\)\?\.trim\(\)/);
  assert.match(bridgeSource, /orderId: explicitOrderId/);
  assert.match(bridgeSource, /this URL value is only a locator, never an authorization boundary/);
});

test("checkout verifies remembered order ownership before resuming it", () => {
  assert.match(checkoutSource, /\.eq\("id", orderId\)/);
  assert.match(checkoutSource, /\.eq\("customer_id", currentSession\.user\.id\)/);
  assert.match(checkoutSource, /if \(!order\)/);
});

test("checkout only resumes orders whose payment is still pending", () => {
  assert.match(checkoutSource, /if \(order\.payment_status !== "pending"\)/);
  assert.match(checkoutSource, /clearRememberedCheckoutOrder\(\)/);
  assert.match(checkoutSource, /order\.status !== "pending_payment"/);
});
