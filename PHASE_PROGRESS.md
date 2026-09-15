# Beulah Foods — Current Build Status

## Phase 1A — Customer shell

Implemented and previously live-tested by the project owner:
- Customer signup/sign-in/log-out and session persistence.
- Customer profile/account backed by `customer_profiles`.
- Responsive header with desktop navigation and mobile hamburger.
- Clean public routes served through `worker.js`.

## Phase 1B — Catalogue

Implemented:
- `categories` and `products` tables with active-only public catalogue reads.
- Live Supabase catalogue service.
- Shop category filtering.
- Server-side storefront pagination (12 products per page).
- Product detail by slug.
- Live pricing and stock.
- Admin category/product management with database-side authorization.
- Product image upload from the admin dashboard to the Supabase Storage `product-images` bucket.
- Product image replacement/removal support through Storage paths; static brand assets remain in `storefront/assets/`.
- Admin product pagination.
- No fake product/image/catalogue data.

## Phase 2 — Shopping, delivery, promos and payments

Implemented in migrations `0003` through `0009` and application code:
- Browser cart persistence and quantity/removal controls.
- Checkout revalidates live product records.
- Trusted `create_pending_order` RPC rechecks price/stock and snapshots order items.
- 15-minute stock reservations.
- Automatic reservation cleanup scheduled through `pg_cron` in `0008`.
- Admin-controlled delivery fee and free-delivery threshold.
- Admin-controlled V1 promo codes: percentage/fixed, minimum order, optional maximum discount, dates, usage limit, activation.
- Database-authoritative delivery/promo calculation during order creation.
- Paystack server-side transaction initialization in `worker.js`.
- Paystack webhook signature verification using HMAC SHA-512.
- Paystack server-side transaction verification from the customer callback.
- Trusted database payment finalization; browser redirects never assert payment success.
- Stock reservation confirmation/release tied to trusted payment state.
- Customer cart is cleared only after verified successful payment.
- Resend transactional order confirmation and optional admin notification from the Worker.
- Customer order history/detail pages show delivery and discount totals.
- Admin orders and transactions are server-paginated.

## Admin authorization

Implemented:
- `admin_users` table.
- Database-side `is_admin()` authorization helper.
- Admin catalogue, delivery, promo and operational record RLS.
- Trusted-only `provision_admin()` boundary.
- Admin order status changes through a narrow trusted database function.
- Payment status protected from browser/admin mutation.

## Production configuration still required

The application code and migration set are prepared, but production is not claimed complete until the owner configures and live-tests:

1. Apply migrations `0001` through `0009` to the production Supabase project in order.
2. Confirm the Supabase Storage bucket `product-images` exists and is public-read/admin-write after migration.
3. Configure the two authorized admin Auth accounts and provision them through the trusted admin provisioning path.
4. Add Cloudflare Worker secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PAYSTACK_SECRET_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM`
   - optional `ORDER_NOTIFICATION_EMAIL`
5. Configure Paystack webhook URL: `/api/paystack/webhook` on the production Worker URL.
6. Configure/verify the Paystack callback URL used by transaction initialization: `/payment-callback.html`.
7. Configure and verify the Resend sending domain/sender identity.
8. Create the first active delivery setting in the admin dashboard.
9. Create promo codes only if/when needed.
10. Upload real product images through Admin; do not place product images in the static asset folder.
11. Run full live E2E tests: signup → profile → catalogue → cart → checkout → promo → Paystack test payment → webhook/callback verification → order → email → stock/reservation behavior → expiry/failure paths.

## Important boundary

The repository is implementation-ready for the selected architecture, but live production readiness depends on the external Supabase, Paystack, Resend and Cloudflare configuration above. No secret keys belong in the repository or browser code.
