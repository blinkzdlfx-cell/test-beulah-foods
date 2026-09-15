# Beulah Foods — Source Reconstruction

## Purpose

This staging branch is a fresh working copy of the Beulah Foods application. The production repository is the audited source reference; staging is the implementation and validation environment.

The application UI and existing working behavior are preserved during reconstruction unless an audited defect or environment-separation requirement requires a change.

## Why a reconstruction utility exists

The production repository is separate from `test-beulah-foods`. Git object/blob identifiers cannot be assumed to be reusable across repositories. Rather than manually rewriting dozens of source and asset files, this repository contains a controlled utility that downloads the public production repository tree into the staging working tree.

The utility is:

```text
scripts/reconstruct-source.mjs
```

It reads `blinkzdlfx-cell/Beulah-foods@main` and copies its source tree into the current working directory.

## Files intentionally excluded

The utility does **not** copy:

- `docs/**` — staging reconstruction documentation must remain authoritative for this work.
- `supabase/migrations/**` — historical production migrations are evidence, not the clean staging foundation.
- `.github/workflows/**` — staging CI must be designed for the reconstruction lifecycle.
- `wrangler.toml` — staging must not inherit the production Worker identity/configuration.

Other production application files, including storefront/admin HTML, CSS, JavaScript, Worker source, email templates, tests, and static assets, are eligible for reconstruction.

## Execution

The reconstruction can be run locally from the `reconstruction` branch:

```bash
node scripts/reconstruct-source.mjs
```

A manual GitHub Actions workflow is also provided:

```text
.github/workflows/reconstruct-source.yml
```

Run the workflow from the `reconstruction` branch when a GitHub-hosted reconstruction is preferred.

## Safety

The utility only reads the public production repository and writes files into the current staging repository working tree. It does not access the production Supabase database, production Cloudflare account, production secrets, Paystack credentials, or production customer data.

## After reconstruction

Reconstruction is not the same as promotion. After the source copy is complete:

1. Verify the complete source inventory.
2. Remove/replace production-specific frontend configuration.
3. Configure staging Supabase values.
4. Configure staging Worker values.
5. Create the clean staging migration chain.
6. Verify the staging schema and security model.
7. Run automated tests.
8. Run Playwright customer/admin tests.
9. Perform staging business-flow verification.
10. Document every defect, decision, and change.

Production remains untouched until an explicit promotion decision.

## Evidence recorded during audit

The production repository confirms that the Worker is part of the application backend as well as the static hosting/routing layer. It exposes Paystack initialize, verify, and webhook routes and uses server-side Supabase/Paystack bindings. The browser Supabase clients use the production project URL and therefore must be environment-separated for staging.

The production application also contains the cart persistence race-protection implementation and a catalogue query that expects `is_featured`; these are implementation details that must be reconciled against the clean staging schema rather than blindly copied into a new database foundation.

## Documentation rule

Every significant reconstruction decision, implementation change, migration decision, security finding, test result, and promotion decision must be recorded in this repository before the work is considered complete.
