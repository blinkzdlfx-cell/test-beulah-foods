# Beulah Foods Checkout Business Logic

**Environment:** `test-beulah-foods` / `reconstruction`

**Purpose:** This document is the business-logic source of truth for cart, checkout, inventory reservation, payment, expiry, retry, promotion usage, and order finalization. It describes the intended behavior before application code is changed.

## 1. Core principles

1. The cart is persistent customer state. It is not the order.
2. Checkout creates an order snapshot from the cart.
3. Product price/name/quantity are snapshotted in `order_items`.
4. Inventory is reserved before Paystack initialization.
5. A payment attempt is a historical record and is never reused for a retry.
6. Physical stock is consumed only after verified successful payment while a valid reservation exists.
7. Failed, cancelled, or expired checkout attempts do not consume physical stock.
8. Cart contents are cleared only after successful order finalization.
9. Promo codes are validated during checkout but usage is permanently consumed only after successful payment.
10. Payment finalization is idempotent: webhook and verification may arrive in either order without double-charging business state, stock, or confirmation side effects.
11. Historical orders, reservations, and payment attempts are retained for audit/history.

## 2. Entity responsibilities

### Cart

Represents what the customer currently intends to purchase. Cart data survives failed, cancelled, and expired checkout attempts.

### Order

Represents a checkout snapshot and its commercial state. An order records delivery information, calculated totals, product snapshots, and payment status.

### Order item

Immutable purchase snapshot: product identity, product name, unit price, quantity, and line total.

### Reservation

Temporary inventory hold associated with a checkout order. Default lifetime is 15 minutes.

States:

- `active` — inventory is held.
- `confirmed` — payment succeeded and the held inventory was consumed.
- `expired` — the hold timed out.
- `cancelled` — the hold was deliberately released before expiry.

### Payment attempt

One attempt to pay an order through Paystack. Each attempt has its own provider reference, amount, status, and raw provider response. Attempts are never overwritten to represent a later retry.

### Inventory

`stock_quantity` is physical sellable stock. `reserved_quantity` is temporarily held stock. Available stock is:

```text
available = stock_quantity - reserved_quantity
```

## 3. Checkout flow

```text
Cart
  -> validate cart and delivery details
  -> release already-expired reservations
  -> enforce open-reservation limit
  -> create order
  -> lock each product row
  -> validate active product and available quantity
  -> snapshot order item
  -> increment reserved_quantity
  -> calculate delivery and discount
  -> create active reservation
  -> create payment attempt
  -> return checkout information
  -> application initializes Paystack
```

**Important:** Paystack initialization happens only after the database transaction has successfully created the reservation and payment attempt.

## 4. Payment success

Paystack success is accepted only through the trusted server-side finalization path.

The finalizer must:

1. Locate the payment by its Paystack reference.
2. Lock the payment and order.
3. Verify the expected amount.
4. Locate and lock the reservation.
5. Reject normal automatic fulfillment if the reservation is no longer active.
6. For an active reservation, decrement `stock_quantity` and `reserved_quantity` atomically.
7. Mark the payment successful.
8. Mark the order paid.
9. Mark the reservation confirmed.
10. Consume promo usage exactly once, if applicable.
11. Return a transition indicator so application code can perform one-time side effects such as clearing the cart and sending confirmation email.

## 5. Payment failure

```text
payment attempt -> failed
reservation active -> cancelled/expired
reserved stock -> released
order -> cancelled
cart -> remains
```

Physical `stock_quantity` is never reduced for a failed payment.

## 6. Reservation expiry

The expiry worker/function finds active reservations whose `expires_at <= now()`.

For each reservation:

```text
reserved_quantity -= reserved amount
reservation -> expired
pending order -> cancelled
```

The operation is idempotent because only `active` reservations are processed.

A scheduled job should call the expiry function regularly; checkout also performs an expiry sweep before creating a new reservation.

## 7. Retry

Retry means a new checkout/payment attempt, not resurrection of an old Paystack transaction.

Example:

```text
Order A
  Payment attempt 1 -> failed

Retry

Order B
  Payment attempt 1 -> pending
```

The exact order relationship may evolve, but an old provider reference must never be overwritten by a retry. Historical attempts remain queryable.

The existing retry helper may release/close the old reservation; the new checkout path creates the fresh reservation and payment attempt.

## 8. Late Paystack success

A reservation timeout is not treated as proof that Paystack payment failed.

If Paystack later reports success after the reservation has expired or been released:

- verify the provider reference and amount;
- record the provider result;
- do not silently consume stock that is no longer reserved;
- do not automatically mark the cancelled order as a normal paid/fulfilled order;
- expose the case for explicit/manual resolution.

This prevents a late provider callback from creating negative or oversold inventory.

## 9. Promo codes

Promo validation occurs during checkout:

```text
validate code
-> calculate discount
-> snapshot discount on order
-> do not increment usage yet
```

After successful payment:

```text
if promo_usage_consumed = false
    usage_count += 1
    promo_usage_consumed = true
```

This makes promo consumption idempotent and prevents abandoned checkouts from permanently consuming usage.

## 10. Idempotency and duplicate callbacks

Paystack webhook and server-side verification can reach the finalizer in either order.

Desired result:

```text
first success callback
    -> successful transition
    -> stock consumed once
    -> order paid once

second success callback
    -> already finalized
    -> no stock change
    -> no duplicate confirmation side effect
```

Application email/cart side effects should run only when the finalizer reports a genuine state transition.

## 11. Order lifecycle

Normal paid order lifecycle:

```text
pending_payment -> paid -> processing -> completed
```

Unsuccessful checkout:

```text
pending_payment -> cancelled
```

Payment status is separate from fulfillment/order status. A payment result must not be used as a substitute for the entire order lifecycle.

## 12. Inventory invariants

The following must always hold:

```text
reserved_quantity >= 0
stock_quantity >= 0
reserved_quantity <= stock_quantity
```

A successful reservation increases only `reserved_quantity`.

A successful payment decreases both `stock_quantity` and `reserved_quantity`.

An expiry/cancellation decreases only `reserved_quantity`.

## 13. Security boundaries

Customer-facing database functions may be `SECURITY DEFINER` where required for atomic inventory operations, but they must enforce the authenticated customer identity internally and use a fixed `search_path`.

Paystack finalization is a trusted server-side operation and must not be callable by ordinary customers.

RLS remains enabled on customer/order/payment/reservation data.

## 14. Implementation boundary

The database owns transactional business invariants:

- inventory locking and reservation;
- order totals/snapshots;
- reservation lifecycle;
- payment finalization;
- promo consumption;
- idempotent state transitions.

The Worker/application owns external integration and presentation:

- initialize Paystack;
- verify Paystack transactions through the provider API;
- validate webhook signatures;
- call the trusted finalization function;
- clear the customer cart after a successful transition;
- send confirmation email once per successful transition;
- present retry/manual-resolution states to the customer/admin.

## 15. Current rebuild status

The test database has been rebuilt/refined to add explicit payment-attempt numbering, unique provider references, deferred promo consumption, transaction-safe checkout sequencing, and late-payment protection.

Production has **not** been modified by this rebuild.

The next required step is automated verification of the state transitions against the database and application code before considering the reconstruction complete.
