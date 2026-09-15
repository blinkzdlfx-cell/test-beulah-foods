# PROJECT.md — Beulah Foods

## What this is

Beulah Foods is a food-products e-commerce website with two clearly separated areas:

1. **Storefront** — customers browse products, manage a cart, check out, and track orders.
2. **Admin dashboard** — authorized staff manage catalogue data, inventory, orders, delivery settings, promo codes, and payment records.

This is a separate project from BFIS (the internal Beulah Foods inventory system). Nothing here should assume or depend on BFIS.

## Locked stack

The project intentionally uses plain HTML5, normal CSS, Vanilla JavaScript, Supabase, and static deployment. No React, Next.js, Vue, Angular, Tailwind, Bootstrap, Vite, or unnecessary build pipeline should be introduced.

Development happens across Claude, Replit, OpenCode, Kilo Code, VS Code, and mobile editors. The repository therefore remains portable and readable as normal files.

## Current implementation status

### Customer foundation
- Supabase Auth signup, email confirmation, login, logout, session handling, forgot/reset password foundation.
- Customer profiles with RLS and authenticated account editing.
- Shared responsive navigation with desktop primary links and a mobile-only hamburger.
- Authenticated navigation exposes My Account appropriately without putting it in the desktop text navigation.

### Catalogue foundation
- Real Supabase categories and products.
- Public access is restricted to active catalogue records.
- Shop, category filtering, product details, pricing, stock availability and server-side pagination use live database records.
- Product images are uploaded by authorized admins to Supabase Storage; product image paths are not static repository assets.

### Shopping and payment foundation
- Persistent browser cart.
- Cart quantity/removal controls and live catalogue revalidation.
- Checkout populated from the authenticated customer profile.
- Trusted order creation rechecks product availability/prices, snapshots order items, calculates delivery/promo rules, reserves stock for 15 minutes, and creates a pending Paystack payment record.
- Paystack initialization is server-side through the Cloudflare Worker.
- Paystack webhook signature verification and server-side transaction verification finalize payment truth.
- Customer cart is cleared only after verified successful payment.
- Reservation expiry is automatically scheduled through `pg_cron` after the migration is applied.
- Resend transactional order email boundary is implemented in the Worker.

### Admin foundation
- Explicit `admin_users` authorization table and database-side `is_admin()` check.
- Trusted-only admin provisioning function; client-controlled role metadata is never used for authorization.
- Admin login and catalogue/category/inventory management.
- Product image upload/replacement through Supabase Storage.
- Server-paginated product, order and transaction lists.
- Admin-controlled delivery fee/free-delivery threshold.
- Admin-controlled V1 promo codes.
- Admin order-status management without allowing browser/admin payment-status tampering.

### Customer orders
- Authenticated order list and individual order detail pages.
- Historical order pricing snapshots include delivery and promo discount information.

## Locked business decisions

These decisions are approved and must not be replaced or invented by an AI coding agent:

- **Payment provider:** Paystack.
- **Delivery:** Admin controls the delivery fee and free-delivery threshold. No hard-coded delivery amount or free-delivery threshold belongs in checkout.
- **Promo codes:** Admin-controlled V1 system with percentage/fixed discounts, minimum order, optional maximum discount, dates, usage limits and activation state.
- **Transactional email:** Resend.
- **Product images:** uploaded by Admin to the Supabase Storage `product-images` bucket. Static assets such as favicon/logo remain in the repository.
- **Admin accounts:** two authorized Beulah admins; provisioning occurs through the trusted admin boundary.

## Remaining external configuration

The following are configuration/testing tasks rather than business decisions:

- Apply migrations `0001` through `0009` to production Supabase.
- Provision the two approved admin accounts.
- Add Cloudflare Worker secrets for Supabase service role, Paystack secret and Resend.
- Configure the Paystack webhook URL.
- Configure/verify the Resend sending domain.
- Create the active delivery setting.
- Run full live E2E testing in Paystack test mode before production mode.

## Read these before building anything

| File | What it covers |
|---|---|
| `ARCHITECTURE.md` | Technical structure and data flow |
| `DEVELOPMENT.md` | Development and testing workflow |
| `DESIGN.md` | Visual direction |
| `FEATURES.md` | Current feature status |
| `RULES.md` | Hard project rules |
| `AGENTS.md` | AI coding-agent rules |
| `PHASE_PROGRESS.md` | Phase-by-phase implementation progress |
