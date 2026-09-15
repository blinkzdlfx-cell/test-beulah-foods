# ARCHITECTURE.md — Beulah Foods

## Tech stack — locked

Use only:

- HTML5
- Normal CSS (with CSS variables and reusable classes)
- Vanilla JavaScript (ES modules are allowed)
- Supabase (auth, database, storage — the backend source of truth)
- Cloudflare Worker for the small privileged server boundary required by Paystack/Resend

Do **not** introduce React, Next.js, Vue, Angular, Tailwind, Bootstrap,
Vite, Webpack, unnecessary npm packages, SPA routing, or hash routing.

## How the pieces fit together

```
beulah-foods/
├── storefront/     ← customer-facing site
├── admin/          ← staff dashboard
├── supabase/       ← SQL migrations
└── worker.js       ← Cloudflare static asset worker + privileged payment/email API boundary
```

Storefront and admin are physically separate. Every screen remains a normal HTML page. There is no SPA router or hash routing.

## Supabase's role

Supabase is the backend source of truth for:

- Authentication
- Products/categories
- Orders/order items
- Reservations
- Payments
- Delivery settings
- Promo codes
- Product image storage

The browser uses only the Supabase anon/public key. RLS and trusted database functions enforce authorization and checkout rules.

## Supabase keys

- **Anon/public key:** allowed in browser code; RLS must protect data.
- **Service-role key:** never place in `/storefront`, `/admin`, GitHub, or any client bundle. It is used only as a Cloudflare Worker secret for trusted server operations.

## Trusted checkout boundary

`create_pending_order` runs inside Postgres and is authoritative for:

- live product price
- live stock
- order-item snapshots
- delivery fee
- free-delivery threshold
- promo validation/calculation
- order total
- stock reservation
- pending Paystack payment creation

The browser may request an order, but it cannot supply the final monetary truth.

## Cloudflare Worker privileged boundary

`worker.js` handles:

- Paystack transaction initialization using the secret key
- Paystack webhook signature verification
- Paystack server-side transaction verification
- trusted payment-finalization RPC calls
- Resend transactional order emails

The Worker validates authenticated customer ownership before initializing/verifying a transaction. Payment status is never changed by a browser request.

## Product images

Admin uploads product images directly to the Supabase Storage bucket `product-images`. The database stores the Storage path in the product image field. Storefront code resolves that path into a public Storage URL.

Static brand assets such as the logo and favicon remain in `storefront/assets/`.

## Reservation lifecycle

Checkout creates a 15-minute reservation. `release_expired_reservations()` restores stock and cancels unpaid orders after expiry. Migration `0008` schedules this function through `pg_cron` every five minutes.

Successful Paystack payment changes the payment/order to successful/paid and confirms the reservation. Failed payment releases the reservation and restores stock.

## What NOT to do

- Do not expose service-role, Paystack secret, or Resend API keys.
- Do not trust payment redirect success as proof of payment.
- Do not calculate final checkout totals only in browser code.
- Do not paste product image URLs into admin product records; use the Storage upload flow.
- Do not add an abstraction layer or framework without an approved reason.
