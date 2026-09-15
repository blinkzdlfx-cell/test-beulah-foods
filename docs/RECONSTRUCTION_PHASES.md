# Beulah Foods — Reconstruction Phases

## Objective

Reach a runnable, testable staging version as quickly as possible while keeping production isolated and avoiding the historical migration duplication problem.

The reconstruction is deliberately split into a **baseline phase** and a **verification phase**. We will not repeatedly patch the foundational SQL with ad-hoc migration files.

## Core rule

> The UI and application structure are copied from the known-working production implementation. The database is rebuilt once from a clean, reviewed target schema. Iteration after that happens through controlled changes, not duplicate migration-history repairs.

Production remains untouched throughout reconstruction.

---

## Phase 0 — Freeze the target and document the contract

### Goal
Establish the exact reconstruction rules before changing application behavior.

### Tasks
- Keep `reconstruction` as the working branch.
- Keep production repository/database untouched.
- Preserve the existing UI unless a staging-specific defect prevents it from functioning.
- Record production behavior as evidence, not as the new database migration history.
- Record staging resource identifiers and environment boundaries.
- Maintain this document as the phase tracker.

### Exit criteria
- Target architecture documented.
- Environment separation documented.
- Known database risks documented.
- No production mutation required.

---

## Phase 1 — Reconstruct the application working copy

### Goal
Get the production-equivalent application source into the staging repository.

### Copy
- Storefront UI.
- Admin UI.
- JavaScript application logic.
- Assets.
- Worker/API implementation.
- Supporting configuration that is safe to copy.
- Existing tests and development tooling where useful.

### Do not copy as-is
- Production secrets.
- Production Supabase credentials.
- Production Paystack credentials.
- Production Worker identifiers.
- Production-only deployment configuration.
- Historical migration chain as the new migration source of truth.

### Validation
- Compare reconstructed application files against production.
- Confirm no intentional UI redesign occurred.
- Confirm the Worker remains responsible for static hosting/routing and payment API behavior.

### Exit criteria
- Staging repository contains a complete application working copy.
- UI structure is equivalent to production.
- Worker source is present.
- No production secret is committed.

---

## Phase 2 — Environment separation

### Goal
Make the copied application explicitly staging-aware without changing its product behavior.

### Tasks
- Replace hardcoded production Supabase browser configuration with staging configuration mechanism.
- Define staging environment variables/configuration.
- Define production environment variables separately.
- Define staging Worker configuration separately.
- Define staging Paystack test credentials boundary.
- Define staging email sender/configuration.
- Remove hardcoded production Worker URLs from application configuration where environment-aware URLs are required.
- Keep public/static UI behavior unchanged.

### Exit criteria
- Staging code cannot accidentally use production secrets through normal configuration.
- Browser points to staging Supabase.
- Worker configuration has a clear staging contract.
- Production configuration remains untouched.

---

## Phase 3 — Clean database foundation

### Goal
Build the staging database correctly once from an empty database.

This is the most controlled phase because the historical production migration chain contains duplicate prefixes, semantic changes, and one-time conversions that must not become the new foundation.

### Method
1. Audit the actual production schema and application requirements.
2. Define the target schema.
3. Define table creation order.
4. Define constraints and indexes.
5. Define RLS policies.
6. Define functions/RPCs.
7. Define function grants.
8. Define security-definer/search-path rules.
9. Define inventory/reservation/payment/cart semantics.
10. Review the complete SQL set before applying it.
11. Apply the clean migration chain to the empty staging project.
12. Verify the resulting schema against the target contract.

### Migration rules
- One clean sequence.
- Unique migration identifiers.
- No duplicate numeric prefixes.
- No copied historical migrations appended to the new chain.
- No production data conversion scripts in foundational migrations.
- No repeated patch migrations merely to repair migration history.
- Any later schema change receives a new unique migration only after the baseline is accepted.

### Target inventory semantics

```text
physical stock  = products.stock_quantity
reserved stock  = products.reserved_quantity
available stock = stock_quantity - reserved_quantity
```

Reservation creation increases reserved stock only.

Successful payment reduces physical stock and releases the reservation.

Cancellation/expiry releases the reservation without reducing physical stock.

### Target payment semantics

Each payment attempt has an immutable provider reference. Retrying payment initialization creates a new attempt/reference rather than overwriting an old provider reference.

Webhook and verification finalization must be idempotent.

### Exit criteria
- Staging schema is reproducible from empty state.
- Constraints are present.
- RLS is present.
- RPC authorization is present.
- Inventory/reservation/payment semantics are internally consistent.
- No duplicate migration identifiers.
- Schema verification passes.

---

## Phase 4 — Connect application to the staging database

### Goal
Make the copied UI and Worker operate against the newly built staging backend.

### Tasks
- Configure browser Supabase client for staging.
- Configure Worker Supabase service credentials through secrets.
- Configure Paystack test credentials through Worker secrets.
- Configure staging email provider values.
- Verify auth/session behavior.
- Verify catalogue reads.
- Verify cart reads/writes.
- Verify checkout/order creation.
- Verify reservation creation/expiry/cancellation.
- Verify payment initialization/finalization boundaries.
- Verify admin authorization.

### Exit criteria
The application is operational against staging resources with no production dependency.

---

## Phase 5 — First functional smoke test

### Goal
Get to the first meaningful browser test quickly.

### Customer path
1. Open staging storefront.
2. Load catalogue.
3. Register/login with staging customer.
4. View products.
5. Add product to cart.
6. Open cart.
7. Start checkout.
8. Create pending order/reservation.
9. Confirm cart is retained before payment.
10. Verify order/reservation records.

### Admin path
1. Login as staging admin.
2. Open dashboard.
3. Load products.
4. Load orders.
5. Confirm admin-only data is inaccessible to customer.

### Exit criteria
The basic application can be exercised end-to-end up to the payment boundary.

---

## Phase 6 — Security and authorization tests

### Goal
Prove isolation before payment testing.

### Tests
- Customer A can access own records.
- Customer A cannot access Customer B records.
- Customer cannot execute admin operations.
- Anonymous users cannot access protected operations.
- Payment status cannot be directly tampered with.
- RPC ownership checks work.
- RLS policies match the intended ownership model.
- Admin authorization is server/database enforced.

### Exit criteria
No critical authorization or cross-customer access defect remains.

---

## Phase 7 — Payment and business-flow tests

### Goal
Verify the high-risk business lifecycle.

### Tests
- Payment initialization creates one immutable attempt/reference.
- Reinitialization does not overwrite a previous provider reference.
- Successful payment finalizes once.
- Duplicate webhook is harmless.
- Duplicate verification is harmless.
- Inventory is deducted exactly once.
- Reservation is confirmed/released exactly once.
- Failed payment releases reserved stock.
- Expired/cancelled orders retain cart items.
- Successful payment removes purchased cart items.
- Transactional email is sent only for the intended state transition.

### Exit criteria
Payment, inventory, reservation and cart lifecycle are consistent and idempotent.

---

## Phase 8 — Playwright full staging test

### Goal
Test the real browser application rather than isolated functions only.

### Customer browser suite
- Authentication.
- Session persistence.
- Catalogue.
- Product details.
- Cart.
- Checkout.
- Pending order.
- Order history.
- Unauthorized admin access.

### Admin browser suite
- Admin authentication.
- Dashboard.
- Product management.
- Inventory display.
- Order management.
- Store settings/configuration.
- Authorization boundaries.

### Exit criteria
Playwright Phase 4 suite passes against staging.

---

## Phase 9 — Fix and stabilize

### Rule
Fix defects by root cause.

Do not create a sequence of speculative SQL patches. If the baseline schema is wrong, update the target schema and rebuild/reapply the clean staging baseline as appropriate before declaring the database contract stable.

For application defects, use normal source changes with tests.

Every defect must record:
- observed behavior
- root cause
- fix
- test proving the fix
- affected documentation

### Exit criteria
- No known critical defects.
- Tests pass repeatedly.
- Documentation matches implementation.

---

## Phase 10 — Reconstruction complete

The staging reconstruction is considered complete when:

- UI is production-equivalent.
- Worker/API is operational.
- Staging Supabase is isolated.
- Clean migrations reproduce the database.
- RLS/security passes.
- Customer/admin boundaries pass.
- Inventory/reservation lifecycle passes.
- Payment lifecycle passes.
- Cart lifecycle passes.
- Playwright passes.
- No critical defect remains.
- Repository documentation is synchronized with the implementation.

Only after this point should production promotion be planned.

---

# Same-Day Execution Target

The practical target is to reach **Phase 5 today** if the staging infrastructure and credentials are available, then continue through Phases 6–8 as quickly as test results allow.

The priority order is:

```text
Application copy
      ↓
Environment separation
      ↓
Clean database baseline
      ↓
Connect staging
      ↓
First browser smoke test
      ↓
Security tests
      ↓
Payment/business tests
      ↓
Playwright
```

We do not need to wait for Cloudflare staging deployment to begin repository and database work.

---

# Documentation Rule

Every significant implementation step must update the repository documentation.

At minimum, update the relevant document when any of these occur:

- architecture decision
- schema decision
- migration creation/change
- security finding
- application behavior change
- environment/configuration change
- test added
- test result
- defect/root cause/fix
- external dependency/blocker
- phase completion
- production-promotion decision

The phase tracker must always identify the current phase and the next concrete action.
