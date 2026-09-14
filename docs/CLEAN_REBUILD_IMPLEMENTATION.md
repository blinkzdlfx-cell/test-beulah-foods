# Beulah Foods — Clean Staging & Reconstruction Implementation Plan

## 1. Purpose

Reconstruct and validate the Beulah Foods application in an isolated staging environment without modifying or risking the current production application or production database.

The existing production system is treated as a live system and evidence source. It is not the development database for this reconstruction.

## 2. Environments

The target environment flow is:

```text
Development → Staging → Production
```

Development and staging must use resources separate from production.

Staging will use the new Supabase project:

- Project: `test-beulah-foods`
- Project ref: `cveghsjotmfygknqyvxg`
- Region: `eu-west-1`
- Status at setup: `ACTIVE_HEALTHY`

The production Supabase project, production Worker, production Paystack credentials, production email configuration, and production storage must not be used for staging.

## 3. Production Safety Rules

Until an explicit production-promotion phase is approved:

- Do not reset production.
- Do not run `db push` against production.
- Do not run destructive production SQL.
- Do not repair or rewrite production migration history blindly.
- Do not use production service-role credentials in staging.
- Do not use production payment credentials for staging tests.
- Do not use production customer data as staging test data unless a separately approved, safe migration process is defined.

## 4. Existing Production System as Reference

The current Beulah Foods repository and production database will be inspected to determine:

- Actual application architecture.
- Existing business rules.
- Existing frontend/backend flows.
- Database schema.
- Database functions/RPCs.
- RLS policies.
- Security-definer functions and grants.
- Inventory behavior.
- Reservation behavior.
- Payment behavior.
- Cart behavior.
- Admin behavior.
- Existing documentation.
- Known defects and architectural inconsistencies.

Existing migrations are historical evidence. They are not automatically the foundation for the new staging migration chain.

## 5. Repository Audit

The existing application repository must be inspected before implementation begins.

Audit areas:

1. Documentation.
2. Storefront source.
3. Admin source.
4. Authentication/session handling.
5. Cart implementation.
6. Checkout implementation.
7. Order creation.
8. Reservation lifecycle.
9. Inventory lifecycle.
10. Paystack initialization, callback, verification, and webhook handling.
11. Email handling.
12. Worker/API routes.
13. Supabase client usage.
14. Environment/configuration handling.
15. Tests and test infrastructure.
16. Deployment configuration.
17. Cloudflare configuration.
18. Existing migration files.

The audit output should distinguish:

- Evidence: behavior confirmed from code/database.
- Recommendation: proposed architecture or improvement.
- Human Decision: decisions that require explicit approval.

## 6. Database Reconstruction

The staging database will receive a clean migration chain based on the audited application requirements.

Migration requirements:

- Unique sequential migration identifiers.
- No duplicate migration prefixes.
- No accidental function overloads.
- No unsafe one-time data conversions in foundational migrations.
- Explicit constraints.
- Explicit indexes.
- Explicit RLS policies.
- Explicit function grants.
- Explicit `SECURITY DEFINER` authorization checks.
- Explicit `search_path` settings where required.
- Reproducible creation order.

The final migration chain must be capable of creating the staging database from an empty database.

## 7. Inventory Model

The staging system will use one clearly defined inventory model:

```text
physical_stock = products.stock_quantity
reserved_stock = products.reserved_quantity
available_stock = stock_quantity - reserved_quantity
```

Creating an order reservation increases `reserved_quantity` only.

Successful payment permanently reduces physical stock and releases the reservation.

Cancellation or expiry releases reserved stock without permanently reducing physical stock.

All application layers must use the same model.

## 8. Reservation Model

Reservations must:

- Belong to one order.
- Belong indirectly to one authenticated customer.
- Have explicit lifecycle states.
- Have an expiration time.
- Release reserved inventory exactly once.
- Prevent excessive concurrent open reservations according to the approved business rule.
- Prevent a customer from manipulating another customer's reservation.

Reservation expiry and cancellation must be idempotent.

## 9. Payment Model

Payment attempts must have immutable provider references.

The application must not overwrite the provider reference of an existing payment attempt when retrying initialization.

Target flow:

```text
Order created
    ↓
Reservation created
    ↓
Payment attempt created
    ↓
Unique provider reference
    ↓
Customer pays
    ↓
Webhook / verification
    ↓
Idempotent finalization
    ↓
Order paid
    ↓
Reservation confirmed
    ↓
Inventory finalized
    ↓
Cart finalized
```

Repeated webhook/verification requests must not:

- Deduct inventory twice.
- Confirm a reservation twice.
- Create duplicate order transitions.
- Send duplicate transactional emails.

## 10. Cart Model

For authenticated customers:

```text
Database = source of truth
LocalStorage = convenience/cache/navigation support
```

Cart items remain until successful payment.

Expected behavior:

```text
Payment successful → remove purchased items
Payment failed     → retain cart
Payment abandoned  → retain cart
Reservation expiry → retain cart
Order cancelled    → retain cart
```

Database persistence must not allow stale asynchronous writes to overwrite newer cart mutations.

## 11. Authorization Model

Customer data must be isolated by authenticated user identity.

Customer A must not be able to access or mutate Customer B's:

- Profile.
- Cart.
- Cart items.
- Orders.
- Order items.
- Reservations.
- Payments.

Customers must not execute administrative operations.

Admin operations must verify administrator authorization server-side/database-side and must not depend solely on hidden frontend UI.

## 12. Security Requirements

The staging security audit must cover:

- RLS coverage.
- RLS ownership predicates.
- SECURITY DEFINER functions.
- Function execution grants.
- `search_path` safety.
- Authenticated vs anonymous execution.
- Admin authorization.
- Payment-status tampering protection.
- Cross-customer data access.
- Direct table mutation attempts.
- RPC parameter ownership checks.

Security-advisor warnings must be reviewed and classified rather than blindly suppressed or fixed.

## 13. Application Reconstruction

After the architecture and database contract are established, the application will be connected to staging.

Application areas include:

- Customer storefront.
- Authentication.
- Product/catalogue display.
- Cart.
- Checkout.
- Reservations.
- Orders.
- Payments.
- Order history.
- Admin authentication.
- Admin dashboard.
- Product management.
- Inventory management.
- Order management.
- Delivery configuration.
- Promo configuration.
- Store settings.

The staging application must not contain fake/mock business data where real database behavior is expected.

## 14. Testing Strategy

Testing is separated by responsibility.

### Database tests

Validate:

- Constraints.
- Foreign keys.
- Inventory calculations.
- Reservation transitions.
- Payment transitions.
- Order transitions.
- Idempotency.

### Supabase API authorization tests

Use dedicated staging customer accounts to validate:

- Own-data access.
- Cross-customer isolation.
- Unauthorized RPC calls.
- Admin/customer separation.
- Payment-status protection.

### Worker/API tests

Validate:

- Authentication.
- Authorization.
- Request validation.
- Error handling.
- Idempotency.
- Database interaction.
- Provider integration boundaries.

### Playwright tests

Phase 4 browser testing should cover:

- Customer login.
- Customer session behavior.
- Storefront access.
- Cart behavior.
- Checkout behavior.
- Customer order access.
- Unauthorized admin access.
- Admin login.
- Admin dashboard access.
- Customer/admin authorization boundaries.

Full end-to-end business workflows remain part of the later full E2E phase.

## 15. CI/CD

Target pipeline:

```text
GitHub commit
    ↓
Automated tests
    ↓
Build
    ↓
Deploy staging
    ↓
Staging verification
    ↓
Production approval
    ↓
Production migration
    ↓
Production deployment
    ↓
Production smoke tests
```

Production promotion must be deliberate and reversible.

## 16. Cloudflare

Cloudflare staging configuration is currently blocked by an account/dashboard access error reported by the user.

This does not block the repository audit or Supabase/database reconstruction.

Cloudflare staging configuration will be handled after the application and staging backend contract are established.

The Cloudflare account issue must be resolved before staging Worker deployment.

## 17. Responsibilities

### Assistant

- Audit the existing repository.
- Analyze documentation and source code.
- Map application and database behavior.
- Analyze production schema/security evidence.
- Design the clean staging architecture.
- Design the new migration chain.
- Implement code and database changes in the staging repository.
- Design and write automated tests.
- Analyze failures and propose fixes.
- Prepare CI/CD configuration.
- Prepare production-promotion procedures.

### User

- Maintain control of production resources.
- Create/provide staging accounts and external resources when required.
- Provide required credentials through secure configuration mechanisms.
- Resolve Cloudflare dashboard/account access before Worker deployment.
- Run local commands when a local environment is required.
- Create/confirm test accounts when needed.
- Approve consequential production changes.
- Perform manual account/payment/provider verification when required.

## 18. Immediate Execution Order

1. Audit the existing Beulah Foods repository.
2. Audit the existing production database without modifying it.
3. Compare documentation, code, database, and business behavior.
4. Produce the final system audit.
5. Define the clean staging schema and migration contract.
6. Initialize the new staging repository.
7. Apply the clean migration chain to the staging Supabase project.
8. Connect the staging application/backend.
9. Run Phase 4 security and functionality tests.
10. Fix failures.
11. Repeat testing until the staging system passes.
12. Continue into the later implementation phases.

## 19. Current Resources

### Staging repository

`blinkzdlfx-cell/test-beulah-foods`

### Staging Supabase

Project ref: `cveghsjotmfygknqyvxg`

Project URL:

`https://cveghsjotmfygknqyvxg.supabase.co`

### Production repository

`blinkzdlfx-cell/Beulah-foods`

### Production system

Existing Beulah Foods production environment. No production changes are authorized by this document.

## 20. Exit Criteria for Reconstruction

The reconstruction is ready for production-promotion planning only when:

- Staging database can be recreated from clean migrations.
- Database security passes review.
- Customer isolation passes.
- Admin authorization passes.
- Inventory behavior passes.
- Reservation behavior passes.
- Payment behavior passes.
- Cart behavior passes.
- Worker/API tests pass.
- Playwright Phase 4 tests pass.
- No unresolved critical security defect remains.
- Documentation matches the implemented architecture.
- CI can reproduce the required validation steps.
