# Beulah Foods — Reconstruction Status

## Current phase

**Phase 2 — Environment separation**

## Status

| Phase | Status | Notes |
|---|---|---|
| 0 — Contract/freeze | Complete | Reconstruction rules and safety boundaries documented. |
| 1 — Application working copy | Complete | Production application source and Worker reconstructed into `reconstruction`; production migrations and deployment config remain excluded. |
| 2 — Environment separation | In progress | Staging Supabase verified healthy; environment contract established; application configuration still needs staging adaptation. |
| 3 — Clean database foundation | Pending | Target schema and clean migration chain. |
| 4 — Staging connection | Pending | Connect application and Worker to staging resources. |
| 5 — Functional smoke test | Pending | First real customer/admin browser test. |
| 6 — Security tests | Pending | RLS, RPC and customer/admin isolation. |
| 7 — Payment/business tests | Pending | Paystack test lifecycle, inventory, reservation and cart. |
| 8 — Playwright staging test | Pending | Full browser regression suite. |
| 9 — Stabilization | Pending | Root-cause fixes and repeated verification. |
| 10 — Reconstruction complete | Pending | Ready for production-promotion planning. |

## Phase 1 verification

The reconstruction workflow completed successfully. The reconstructed branch contains the production application source, including the Worker and browser application trees. The production `supabase/migrations` history and production deployment configuration were intentionally excluded by the reconstruction process.

## Phase 2 observations

- Staging Supabase project: `cveghsjotmfygknqyvxg`
- Staging Supabase URL: `https://cveghsjotmfygknqyvxg.supabase.co`
- Staging Supabase is `ACTIVE_HEALTHY`.
- Staging database is intended to remain data-empty until the clean baseline is applied.
- Browser clients must use staging Supabase URL/public key after configuration adaptation.
- Worker secrets must be supplied through the staging deployment environment and never committed.
- Cloudflare staging Worker creation remains an external dependency being handled separately.

## Database rule

The database foundation is treated as a controlled baseline. We will not reproduce the historical duplicate migration-prefix problem by continually adding speculative patch migrations.

If a foundational database decision is wrong before acceptance, correct the target baseline and validate it again. Once accepted, subsequent schema changes must use deliberate, unique migrations with documented purpose and tests.

## Documentation rule

This status file must be updated whenever a phase starts, completes, is blocked, or materially changes. Related architecture, schema, security, test and deployment documents must also be updated when their subject changes.

## Safety

Production remains read-only for reconstruction. No production database reset, migration repair, destructive SQL, secret reuse, or production deployment is part of the current work.
