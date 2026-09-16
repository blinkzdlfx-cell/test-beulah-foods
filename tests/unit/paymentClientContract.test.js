import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const checkoutSource = await readFile(
  new URL("../../storefront/js/pages/checkout.js", import.meta.url),
  "utf8",
);
const callbackSource = await readFile(
  new URL("../../storefront/js/pages/payment-callback.js", import.meta.url),
  "utf8",
);
const workerSource = await readFile(new URL("../../worker.js", import.meta.url), "utf8");

test("checkout sends the server order identifier to payment initialization", () => {
  assert.match(checkoutSource, /fetch\("\/api\/paystack\/initialize"/);
  assert.match(checkoutSource, /Authorization: `Bearer \$\{currentSession\.access_token\}`/);
  assert.match(checkoutSource, /JSON\.stringify\(\{ order_id: orderId \}\)/);
});

test("payment callback only removes cart items after a successful verification", () => {
  assert.match(callbackSource, /if \(data\.payment_status === "successful"\)/);
  assert.match(callbackSource, /await removePaidItems\(data\.order_id\)/);
  assert.doesNotMatch(
    callbackSource,
    /if \(data\.payment_status === "failed"\)[\s\S]*removePaidItems\(/,
  );
});

test("payment verification requires an authenticated customer and reference", () => {
  assert.match(workerSource, /url\.pathname === "\/api\/paystack\/verify"/);
  assert.match(workerSource, /const auth = getBearerToken\(request\)/);
  assert.match(workerSource, /if \(!auth\) return json\(\{ error: "AUTH_REQUIRED" \}, 401\)/);
  assert.match(workerSource, /const reference = url\.searchParams\.get\("reference"\)/);
  assert.match(workerSource, /if \(!reference\) return json\(\{ error: "REFERENCE_REQUIRED" \}, 400\)/);
});

test("the browser cannot directly mark an order as paid", () => {
  assert.doesNotMatch(checkoutSource, /payment_status\s*[:=]\s*["']successful["']/);
  assert.doesNotMatch(callbackSource, /payment_status\s*[:=]\s*["']successful["']/);
  assert.match(workerSource, /finalizePayment\(/);
});
