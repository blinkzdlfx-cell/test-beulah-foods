# Beulah Foods — Reconstruction Status

## Current phase

**Phase 1 — Reconstruct the application working copy**

## Objective

Create a fresh staging working copy of the known-working production application while preserving the UI and isolating production resources.

## Status

| Phase | Status | Notes |
|---|---|---|
| 0 — Contract/freeze | Complete | Reconstruction rules and safety boundaries documented. |
| 1 — Application working copy | In progress | Automated source reconstruction is prepared. |
| 2 — Environment separation | Pending | Staging Supabase/Worker/provider configuration. |
| 3 — Clean database foundation | Pending | Target schema and clean migration chain. |
| 4 — Staging connection | Pending | Connect application and Worker to staging resources. |
| 5 — Functional smoke test | Pending | First real customer/admin browser test. |
| 6 — Security tests | Pending | RLS, RPC and customer/admin isolation. |
| 7 — Payment/business tests | Pending | Paystack test lifecycle, inventory, reservation and cart. |
| 8 — Playwright staging test | Pending | Full browser regression suite. |
| 9 — Stabilization | Pending | Root-cause fixes and repeated verification. |
| 10 — Reconstruction complete | Pending | Ready for production-promotion planning. |

## Immediate next actions

1. Run the reconstruction workflow on branch `reconstruction`.
2. Verify the resulting source tree against production.
3. Keep production-only migration/configuration files out of the reconstructed working copy.
4. Create the environment configuration contract.
5. Finalize the clean database baseline before applying it to staging.

## Database rule

The database foundation is treated as a controlled baseline. We will not reproduce the historical duplicate migration-prefix problem by continually adding speculative patch migrations.

If a foundational database decision is wrong before acceptance, correct the target baseline and validate it again. Once accepted, subsequent schema changes must use deliberate, unique migrations with documented purpose and tests.

## Documentation rule

This status file must be updated whenever a phase starts, completes, is blocked, or materially changes. Related architecture, schema, security, test and deployment documents must also be updated when their subject changes.

## Safety

Production remains read-only for reconstruction. No production database reset, migration repair, destructive SQL, secret reuse, or production deployment is part of the current work.
