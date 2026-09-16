import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const checkoutSource = await readFile(
  new URL("../../storefront/js/pages/checkout.js", import.meta.url),
  "utf8",
);
const checkoutBridgeSource = await readFile(
  new URL("../../storefront/js/services/checkoutStateBridge.js", import.meta.url),
  "utf8",
);
const trustedCheckoutMigration = await readFile(
  new URL("../../supabase/migrations/0005_trusted_checkout.sql", import.meta.url),
  "utf8",
);
const cancellationMigration = await readFile(
  new URL(
    "../../supabase/migrations/0014_cancel_and_harden_late_payments.sql",
    import.meta.url,
  ),
  "utf8",
);

test("pending-order creation requires an authenticated customer", () => {
  assert.ok(
    trustedCheckoutMigration.includes(
      "if customer is null then raise exception 'AUTH_REQUIRED'; end if;",
    ),
  );
  assert.match(trustedCheckoutMigration, /grant execute on function public\.create_pending_order/);
  assert.match(trustedCheckoutMigration, /to authenticated/);
});

test("pending-order creation rejects an empty cart", () => {
  assert.ok(
    trustedCheckoutMigration.includes(
      "if jsonb_typeof(cart_items) <> 'array' or jsonb_array_length(cart_items) = 0 then raise exception 'CART_EMPTY'; end if;",
    ),
  );
});

test("new checkout orders start pending payment with a 15-minute reservation", () => {
  assert.match(
    trustedCheckoutMigration,
    /values \(customer, 'pending_payment', 'pending'/,
  );
  assert.match(trustedCheckoutMigration, /v_expires_at := now\(\) \+ interval '15 minutes'/);
  assert.match(
    trustedCheckoutMigration,
    /insert into public\.reservations \(order_id, status, expires_at\)\s+values \(order_id, 'active', v_expires_at\)/,
  );
});

test("pending-order creation snapshots live product pricing and quantity", () => {
  assert.match(
    trustedCheckoutMigration,
    /select id, name, price, stock_quantity, reserved_quantity, is_active/,
  );
  assert.match(
    trustedCheckoutMigration,
    /item_total := round\(product_row\.price \* requested_quantity, 2\)/,
  );
  assert.match(
    trustedCheckoutMigration,
    /insert into public\.order_items \(order_id, product_id, product_name, unit_price, quantity, line_total\)/,
  );
});

test("checkout preserves the cart until the successful payment boundary", () => {
  assert.doesNotMatch(
    checkoutSource,
    /removeCartItems\s*\(/,
    "checkout must not remove cart items while payment is pending",
  );
});

test("checkout resumes only a pending-payment order owned by the current user", () => {
  assert.match(checkoutSource, /\.eq\("customer_id", currentSession\.user\.id\)/);
  assert.match(checkoutSource, /if \(order\.payment_status !== "pending"\)/);
  assert.match(checkoutSource, /order\.status !== "pending_payment"/);
});

test("customer cancellation only applies to pending payment orders", () => {
  assert.match(
    cancellationMigration,
    /order_row\.status <> 'pending_payment' or order_row\.payment_status <> 'pending'/,
  );
  assert.match(cancellationMigration, /raise exception 'ORDER_NOT_CANCELLABLE'/);
  assert.match(
    cancellationMigration,
    /create or replace function public\.cancel_pending_order\(target_order_id uuid\)/,
  );
});

test("cancellation restores an active reservation and releases its stock", () => {
  assert.match(
    cancellationMigration,
    /if reservation_row\.id is not null and reservation_row\.status = 'active'/,
  );
  assert.match(
    cancellationMigration,
    /set stock_quantity = stock_quantity \+ item_row\.quantity,\s+reserved_quantity = greatest\(0, reserved_quantity - item_row\.quantity\)/,
  );
  assert.match(
    cancellationMigration,
    /update public\.reservations\s+set status = 'expired'/,
  );
});

test("cancellation is idempotent after an order has already been released", () => {
  assert.match(
    cancellationMigration,
    /order_row\.status = 'cancelled' and order_row\.payment_status = 'pending'/,
  );
  assert.match(cancellationMigration, /'already_cancelled', true/);
});

test("late payment success cannot resurrect an expired or cancelled order", () => {
  assert.match(
    cancellationMigration,
    /order_row\.status <> 'pending_payment'\s+or reservation_row\.id is null\s+or reservation_row\.status <> 'active'\s+or reservation_row\.expires_at <= now\(\)/,
  );
  assert.match(
    cancellationMigration,
    /set payment_status = 'successful', status = 'cancelled'/,
  );
  assert.match(cancellationMigration, /late_payment := true/);
});

test("explicit order links remain a locator and are validated against session ownership", () => {
  assert.match(
    checkoutBridgeSource,
    /const explicitOrderId = params\.get\("order"\)\?\.trim\(\)/,
  );
  assert.match(
    checkoutBridgeSource,
    /this URL value is only a locator, never an authorization boundary/,
  );
  assert.match(checkoutSource, /\.eq\("id", orderId\)/);
  assert.match(checkoutSource, /\.eq\("customer_id", currentSession\.user\.id\)/);
});
