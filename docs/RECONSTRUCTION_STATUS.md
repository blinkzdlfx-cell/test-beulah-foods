# Beulah Foods — Reconstruction Status

## Current phase

**Phase 4 — Staging connection**

## Status

| Phase | Status | Notes |
|---|---|---|
| 0 — Contract/freeze | Complete | Reconstruction rules and safety boundaries documented. |
| 1 — Application working copy | Complete | Production application source and Worker reconstructed into `reconstruction`; production migrations and deployment config remain excluded. |
| 2 — Environment separation | Complete* | Browser clients target staging and an isolated staging Worker configuration is committed. Cloudflare Worker creation/deployment remains external. |
| 3 — Clean database foundation | Complete* | Staging schema was inspected and verified as a data-empty application schema with the target tables, inventory semantics, RLS policies and trusted RPC boundaries; trusted payment finalization was added as a unique migration. Baseline provenance still needs to be consolidated into a reproducible SQL source file before final reconstruction sign-off. |
| 4 — Staging connection | In progress | Browser → staging Supabase is configured. Worker deployment is waiting on staging Cloudflare Worker availability and secrets. |
| 5 — Functional smoke test | Pending | First real customer/admin browser test. |
| 6 — Security tests | Pending | RLS, RPC and customer/admin isolation. |
| 7 — Payment/business tests | Pending | Paystack test lifecycle, inventory, reservation and cart. |
| 8 — Playwright staging test | Pending | Full browser regression suite. |
| 9 — Stabilization | Pending | Root-cause fixes and repeated verification. |
| 10 — Reconstruction complete | Pending | Ready for production-promotion planning. |

## Phase 1 verification

The reconstruction workflow completed successfully. The reconstructed branch contains the production application source, including `worker.js`, storefront and admin application trees. Production migration history and production deployment configuration were intentionally excluded from the reconstructed source copy.

## Phase 2 verification

- Staging Supabase project: `cveghsjotmfygknqyvxg`
- Staging Supabase status: `ACTIVE_HEALTHY`
- Storefront browser Supabase client targets staging.
- Admin browser Supabase client targets staging.
- Source reconstruction is manual-only so environment-specific staging configuration cannot be overwritten on every commit.
- `wrangler.staging.toml` defines an isolated `beulah-foods-staging` Worker with no production route configuration.
- Server-only secrets are not committed.

## Phase 3 database findings

The staging project was not actually schema-empty when reconstruction work reached the database stage. It contained the expected application tables and current target-shaped columns. No destructive reset was performed.

Verified application tables:

- `customer_profiles`
- `admin_users`
- `categories`
- `products`
- `delivery_settings`
- `promo_codes`
- `orders`
- `order_items`
- `reservations`
- `payments`
- `customer_carts`
- `customer_cart_items`

Verified inventory model:

`stock_quantity` is physical stock and `reserved_quantity` is held stock; available stock is `stock_quantity - reserved_quantity`.

Verified target database behavior already present:

- customer/admin RLS boundaries
- customer order/item/reservation/payment visibility
- admin catalogue and operational access
- customer cart RPCs
- trusted pending-order creation
- reservation release/cancellation/retry functions
- order-number sequence
- unique payment provider references

A missing trusted payment finalizer was added as `0002_payment_finalization.sql`. It is service-role-only, checks the provider amount, locks payment/order/reservation rows, consumes physical stock only on successful payment, releases held stock on failure, and is idempotent for already-finalized states.

### Baseline provenance note

The database structure was already present in staging before this reconstruction pass could establish a single reproducible baseline file. Therefore we did not destroy it merely to recreate the same schema. The remaining Phase 3 documentation task is to capture the verified schema and functions into one reproducible baseline source before reconstruction receives final sign-off.

## Phase 4

Browser Supabase configuration is connected to staging. Full Worker/API connection is pending only on the Cloudflare staging Worker and its staging secrets/configuration.

## Database rule

The foundational schema must have one reproducible source of truth. Historical production migration files remain reference evidence only. No duplicate migration-prefix history will be copied forward.

## Documentation rule

This status file must be updated whenever a phase starts, completes, is blocked, or materially changes. Related architecture, schema, security, test and deployment documents must also be updated when their subject changes.

## Safety

Production remains read-only for reconstruction. No production database reset, migration repair, destructive SQL, secret reuse, or production deployment is part of the current work.
