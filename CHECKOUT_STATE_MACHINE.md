# Beulah Foods Checkout / Payment State Machine

## Scope

This document defines the TEST checkout/payment contract. Database state is authoritative. Browser countdowns and storage are presentation/cache layers only.

## Canonical lifecycle

### New checkout

`cart -> create_pending_order() -> order=pending_payment + payment=pending + reservation=active`

Reservation window: 15 minutes from database `now()`.

### Successful payment while reservation is valid

`payment pending -> successful`

`reservation active -> confirmed`

`order pending_payment/pending -> paid/successful`

Physical stock is decremented exactly once and reserved stock accounting is decremented in the same transaction.

### Failed payment

`payment pending -> failed`

`reservation active -> cancelled` (or `expired` if its timestamp has already passed)

`order pending_payment/pending -> cancelled/failed`

Reserved stock is released exactly once.

### Reservation expiration

When `status=active AND expires_at <= now()`:

`reservation -> expired`

`reserved_quantity -> released`

`pending_payment order -> cancelled`

The cleanup operation is idempotent. Only the transaction that changes `active -> expired` performs the inventory release.

### Cancellation

Customer cancellation transitions an active reservation to `cancelled` (or `expired` when its timestamp has already passed), releases reserved stock, and cancels the pending order. A repeated cancellation is harmless.

### Retry

A retry never reuses or mutates an old Paystack attempt into a new attempt. The historical payment remains historical. The old reservation is released/expired/cancelled and a fresh checkout creates a fresh order/reservation/payment attempt and unique Paystack reference.

## Late Paystack success

If Paystack reports success after the reservation is no longer valid:

- payment is recorded as successful;
- `late_payment=true`;
- `manual_resolution_required=true`;
- no physical stock is consumed;
- no released reservation is resurrected;
- the order is not silently converted to a normal paid order.

## Payment amount contract

- `orders.total`: NGN
- `payments.amount`: NGN
- Paystack transaction amount: NGN * 100 (kobo)
- `finalize_paystack_payment(target_amount_kobo)` compares the provider amount with `round(payments.amount * 100)`.

New/updated payment rows are protected by a database trigger requiring `payments.amount = orders.total` in NGN. Historical contaminated rows are not rewritten by this migration.

## Authority boundaries

### Database/backend

Authoritative for stock, reserved stock, reservation validity, payment finalization, order state, payment state, and successful inventory consumption.

### Frontend

May display a countdown and retain anonymous cart state. When the countdown reaches zero it must requery backend state; it must not invent a new reservation state locally.

### Cloudflare

Currently remains a storefront/static asset host and Paystack proxy. The payment proxy is intentionally retained until the full E2E matrix passes.

## Scheduler

The TEST database initially had no installed `pg_cron`, no `cron.job` entry, and the TEST repository contained no reservation scheduler implementation. The current Worker also contains only storefront routing and the Paystack proxy; it has no scheduled handler.

The controlled rebuild therefore installs `pg_cron` in TEST and schedules:

`beulah-release-expired-reservations`

`*/5 * * * *`

command:

`select public.release_expired_reservations();`

The scheduler must be proven through `cron.job_run_details` after execution. Prior scheduler/dashboard history is **NOT VERIFIED** because the available project connector exposed the database and Edge Function state but not Supabase Dashboard scheduler history.

## Invariants

1. `reserved_quantity >= 0`.
2. `stock_quantity >= reserved_quantity`.
3. Active reservations cannot be inserted/updated with `expires_at <= now()`.
4. Expiration releases inventory only on the `active -> expired` transition.
5. Successful finalization consumes inventory only while the reservation is active and unexpired.
6. Repeated verify/webhook calls do not consume stock twice.
7. Unknown references fail safely.
8. Wrong provider amount raises `PAYMENT_AMOUNT_MISMATCH` and does not consume stock.
9. Historical payment attempts are not overwritten by retries.

## Acceptance

The rebuild is not accepted on code inspection alone. Acceptance requires the real TEST database, real Paystack test environment, scheduler execution history, browser workflows, and the complete E2E matrix, including the explicitly required Easter test.
