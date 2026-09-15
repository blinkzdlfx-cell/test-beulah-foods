# Beulah Foods — Reconstruction Status

## Current phase

**Phase 4 — Connect the application to staging resources**

## Objective

Reconstruct the production-equivalent application, isolate staging resources, establish a clean database foundation, and connect the application to staging without touching production.

## Status

| Phase | Status | Notes |
|---|---|---|
| 0 — Contract/freeze | Complete | Reconstruction rules and safety boundaries documented. |
| 1 — Application working copy | Complete | 120 production application/source files reconstructed onto `reconstruction`; historical migrations and production deployment config were excluded. |
| 2 — Environment separation | Complete | Staging Supabase configuration applied to browser clients; staging environment contract and isolated Worker configuration added. |
| 3 — Clean database foundation | Complete | Clean baseline applied to empty staging Supabase; 12 application tables, RLS, constraints, indexes and required RPCs established. |
| 4 — Staging connection | In progress | Application is configured for staging Supabase. Final Worker deployment/secret wiring is blocked until the dedicated staging Cloudflare Worker exists. |
| 5 — Functional smoke test | Pending | First real customer/admin browser test. |
| 6 — Security tests | Pending | RLS, RPC and customer/admin isolation. |
| 7 — Payment/business tests | Pending | Paystack test lifecycle, inventory, reservation and cart. |
| 8 — Playwright staging test | Pending | Full browser regression suite. |
| 9 — Stabilization | Pending | Root-cause fixes and repeated verification. |
| 10 — Reconstruction complete | Pending | Ready for production-promotion planning. |

## Phase 1 completion evidence

The reconstruction workflow copied 120 production source files, including the storefront, admin dashboard, Worker, tests and documentation. It committed them to `reconstruction` as commit `395dfaf`. Production migration history and production `wrangler.toml` were intentionally excluded from the reconstructed source copy.

## Phase 2 completion evidence

The staging Supabase project is `cveghsjotmfygknqyvxg`. Both browser Supabase clients now use the staging project URL and staging anon/public key. The staging branch also contains a dedicated `wrangler.toml` configured for `beulah-foods-staging` and an environment contract defining independent staging credentials/resources.

The Worker continues to use relative `/api/paystack/*` routes, so browser requests remain deployment-origin-relative rather than hardcoded to the production Worker URL.

## Phase 3 completion evidence

The staging database was empty before reconstruction. A single clean migration named `clean_baseline` was applied and recorded by Supabase as version `20260915080245`.

The baseline contains 12 application tables, RLS on all 12 tables, the required checkout/reservation/cart/payment/admin RPCs, core constraints and indexes, and the auth-user profile trigger. No production application data was copied.

The historical duplicate migration-prefix problem is not reproduced in the staging migration chain.

## Phase 4 immediate blocker

The remaining Phase 4 infrastructure dependency is the dedicated Cloudflare staging Worker. The repository-side configuration is ready, but deployment cannot be completed until the staging Worker/service is available and its secrets are configured.

Required staging Worker secrets:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PAYSTACK_SECRET_KEY
RESEND_API_KEY
RESEND_FROM
```

Values must be staging/test values and must not be committed to Git.

## Database rule

The database foundation is treated as a controlled baseline. We will not reproduce the historical duplicate migration-prefix problem by continually adding speculative patch migrations.

If a foundational database decision is wrong before acceptance, correct the target baseline and validate it again. Once accepted, subsequent schema changes must use deliberate, unique migrations with documented purpose and tests.

## Documentation rule

This status file must be updated whenever a phase starts, completes, is blocked, or materially changes. Related architecture, schema, security, test and deployment documents must also be updated when their subject changes.

## Safety

Production remains read-only for reconstruction. No production database reset, migration repair, destructive SQL, secret reuse, or production deployment is part of the current work.
