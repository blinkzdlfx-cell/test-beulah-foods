import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const checkoutSource = await readFile(
  new URL("../../storefront/js/pages/checkout.js", import.meta.url),
  "utf8",
);

const pendingOrderSource = await readFile(
  new URL(
    "../../supabase/migrations/0011_fix_pending_order_optional_promo.sql",
    import.meta.url,
  ),
  "utf8",
);

test("checkout subtotal is calculated from product price multiplied by normalized quantity", () => {
  assert.match(checkoutSource, /Number\(item\.product\.price\) \* Math\.max\(1, Number\.parseInt\(item\.quantity, 10\) \|\| 1\)/);
});

test("checkout local total follows subtotal plus delivery minus discount", () => {
  assert.match(checkoutSource, /subtotal \+ delivery - discount/);
});

test("checkout does not invent a delivery fee when delivery is disabled", () => {
  assert.match(checkoutSource, /return isDeliveryEnabled\(\) \? Math\.max\(0, Number\(deliverySettings\?\.delivery_fee \?\? 0\)\) : 0/);
});

test("pending order pricing is calculated from database product prices", () => {
  assert.match(pendingOrderSource, /select id, name, price, stock_quantity, reserved_quantity, is_active/);
  assert.match(pendingOrderSource, /item_total := round\(product_row\.price \* requested_quantity, 2\)/);
  assert.match(pendingOrderSource, /v_subtotal := v_subtotal \+ item_total/);
});

test("pending order total cannot become negative", () => {
  assert.match(
    pendingOrderSource,
    /v_total := greatest\(0, round\(v_subtotal \+ v_delivery_fee - v_discount, 2\)\)/,
  );
});

test("percentage promotions are calculated from subtotal and respect a maximum discount", () => {
  assert.match(
    pendingOrderSource,
    /v_discount := round\(v_subtotal \* promo_row\.discount_value \/ 100, 2\)/,
  );
  assert.match(
    pendingOrderSource,
    /v_discount := least\(v_discount, promo_row\.maximum_discount_amount\)/,
  );
});

test("fixed promotions cannot discount more than the subtotal", () => {
  assert.match(pendingOrderSource, /v_discount := least\(promo_row\.discount_value, v_subtotal\)/);
});

test("the server-side pending-order total is persisted as the order total", () => {
  assert.match(
    pendingOrderSource,
    /set subtotal = v_subtotal,[\s\S]*delivery_fee = v_delivery_fee,[\s\S]*discount_amount = v_discount,[\s\S]*total = v_total,/,
  );
});

test("checkout sends the order id to the payment boundary instead of marking payment successful client-side", () => {
  assert.match(checkoutSource, /fetch\("\/api\/paystack\/initialize"/);
  assert.match(checkoutSource, /body: JSON\.stringify\(\{ order_id: orderId \}\)/);
  assert.doesNotMatch(checkoutSource, /payment_status\s*=\s*["']paid["']/);
});
