import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const checkoutSource = await readFile(
  new URL("../../storefront/js/pages/checkout.js", import.meta.url),
  "utf8",
);

const retryGuardSource = checkoutSource;

function rpcCalls(source) {
  return [...source.matchAll(/supabase\.rpc\(\s*["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
}

test("checkout detects an active remembered reservation", () => {
  assert.match(checkoutSource, /reservation\?\.status === "active"/);
  assert.match(checkoutSource, /Date\.parse\(reservation\.expires_at\) > Date\.now\(\)/);
  assert.match(checkoutSource, /state: active \? "reserved" : "expired"/);
});

test("checkout distinguishes expired reservations from cancelled orders", () => {
  assert.match(checkoutSource, /order\.status === "cancelled"/);
  assert.match(checkoutSource, /reservation\?\.status === "expired"/);
  assert.match(checkoutSource, /state: wasAutoExpired \? "expired" : "cancelled"/);
});

test("checkout uses the retry RPC for expired pending orders", () => {
  assert.deepEqual(rpcCalls(retryGuardSource).filter((name) => name.includes("retry")), [
    "retry_expired_pending_order",
  ]);
  assert.match(checkoutSource, /RESERVATION_STILL_ACTIVE/);
  assert.match(checkoutSource, /ORDER_NOT_RETRYABLE/);
  assert.match(checkoutSource, /ORDER_NOT_FOUND/);
});

test("checkout prevents payment submission after the reservation expires", () => {
  assert.match(checkoutSource, /if \(reservationExpired\(\)\)/);
  assert.match(checkoutSource, /setReservationState\("expired"/);
  assert.match(checkoutSource, /form\.hidden = true/);
});

test("checkout exposes cancellation through the pending-order RPC", () => {
  assert.deepEqual(rpcCalls(checkoutSource).filter((name) => name.includes("cancel")), [
    "cancel_pending_order",
  ]);
});
