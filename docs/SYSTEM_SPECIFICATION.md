# Beulah Foods — System Specification

## 1. Purpose

This document defines the target behavior and architecture for the clean Beulah Foods staging reconstruction.

The staging system is reconstructed from audited application behavior, production schema/security evidence, and the approved clean-rebuild implementation plan. Production remains unchanged during reconstruction.

## 2. Source-of-Truth Rules

- GitHub is the source of truth for application code and migration files.
- The staging Supabase project is the source of truth for staging database state.
- The production Supabase project is reference evidence only until an explicit promotion phase.
- Database state is authoritative for products, inventory, reservations, orders, payments, customer carts, settings, and other business data.
- Browser storage may support navigation, caching, and temporary checkout state but must not become the authoritative business store.
- The application must not fabricate mock business data where real database behavior is expected.

## 3. Environment Separation

Required environments:

```text
Development → Staging → Production
```

Staging must use independent:

- Supabase project/database.
- Worker deployment/environment.
- Supabase credentials.
- Payment credentials/configuration.
- Email configuration.
- Mutable storage resources.

Production credentials and mutable production resources must never be used by staging tests.

## 4. Customer and Admin Roles

### Customer

A customer may:

- View public catalogue data.
- Authenticate.
- Manage their own profile.
- Manage their own cart.
- Create orders through the approved checkout flow.
- View their own orders and order items.
- View their own reservations and payment records where the application exposes them.
- Initiate payment for their own pending order.

A customer must not access another customer's data or administrative operations.

### Admin

An authorized admin may perform approved administrative operations, including:

- Catalogue management.
- Inventory management.
- Order management.
- Delivery configuration.
- Promo configuration.
- Store settings.

Admin authorization must be enforced server-side/database-side and must not rely only on hidden frontend controls.

## 5. Catalogue

The catalogue consists of categories and products.

Public storefront queries must expose only products/categories that are intended to be publicly visible according to the database contract.

Product records must contain authoritative pricing and inventory information. Order creation must snapshot the relevant product values into order items so later catalogue changes do not rewrite historical order data.

The `is_featured` capability requires explicit reconciliation between the application and staging schema before it is treated as part of the production contract; production evidence showed that the repository migration adding it does not match the inspected live production schema.

## 6. Inventory Contract

The target staging inventory model is:

```text
physical_stock = products.stock_quantity
reserved_stock = products.reserved_quantity
available_stock = stock_quantity - reserved_quantity
```

Rules:

1. Creating a pending order does not permanently consume physical stock.
2. A reservation increases `reserved_quantity`.
3. Available stock is calculated as physical minus reserved stock.
4. A cancelled or expired reservation releases reserved stock.
5. Successful payment permanently reduces physical stock and releases the reservation.
6. Inventory changes must be transactional and protected against negative quantities.
7. Concurrent checkout attempts must not oversell available inventory.

All frontend displays, checkout logic, RPCs, and payment finalization must use this same model.

## 7. Reservation Contract

A reservation:

- Belongs to exactly one order.
- Is associated with the authenticated customer through that order.
- Has an explicit lifecycle status.
- Has an expiration timestamp.
- Holds inventory through `reserved_quantity`.

Expected lifecycle:

```text
active → confirmed
active → expired
active → cancelled
```

Reservation release must be idempotent. Repeating expiry/cancellation handling must not release the same reserved quantity twice.

The approved business rule limiting concurrently open reservations must be implemented consistently across database and application behavior.

## 8. Order Contract

The target order lifecycle is:

```text
pending_payment → paid → processing → completed
pending_payment → cancelled
```

An order may be cancelled by an approved cancellation/expiry path while it remains eligible for cancellation.

Order creation must:

1. Authenticate the customer.
2. Validate delivery information.
3. Validate cart/product quantities against current availability.
4. Lock relevant product rows where required for consistency.
5. Snapshot product name/price information into order items.
6. Apply valid promotion logic.
7. Calculate totals server-side.
8. Reserve inventory.
9. Create the order reservation.
10. Create a pending payment attempt.

Clients must not be trusted to provide authoritative totals, stock, reservation ownership, or payment status.

## 9. Payment Contract

Payments are provider attempts, not mutable placeholders.

Each payment attempt must have:

- One order.
- One immutable provider reference.
- One amount expected by the server.
- One lifecycle status.

Retrying payment initialization must create a new attempt/reference rather than overwriting an existing provider reference.

Target flow:

```text
Order created
  ↓
Reservation active
  ↓
Payment attempt created
  ↓
Unique provider reference
  ↓
Customer pays
  ↓
Webhook and/or verification
  ↓
Idempotent finalization
  ↓
Order paid
  ↓
Reservation confirmed
  ↓
Physical inventory reduced
  ↓
Purchased cart items removed
```

Repeated webhook or verification requests must be safe. They must not:

- Deduct stock twice.
- Release/confirm reservations twice.
- Transition orders repeatedly.
- Send duplicate transactional emails.

Payment status must not be customer-writable through direct table mutation.

## 10. Cart Contract

For authenticated customers:

```text
Database = source of truth
LocalStorage = convenience/cache/navigation support
```

Cart contents remain available until payment succeeds.

| Event | Cart behavior |
|---|---|
| Payment successful | Remove purchased items |
| Payment failed | Retain items |
| Payment abandoned | Retain items |
| Reservation expired | Retain items |
| Order cancelled | Retain items |

Database persistence must serialize or otherwise protect against stale asynchronous writes overwriting newer cart mutations.

Cart quantities must be sanitized against current product availability according to the database contract.

## 11. Authentication and Authorization

Authentication is based on Supabase Auth.

Authorization requirements:

- Customer records are isolated by authenticated user ID.
- Customer A cannot read Customer B's profile, cart, orders, order items, reservations, or payments.
- Customer A cannot execute admin operations.
- Admin operations must validate administrator membership server-side/database-side.
- RPCs must validate ownership internally rather than trusting caller-supplied customer/order IDs.

Direct table mutations for protected business entities should remain unavailable to normal customers when the intended workflow is through validated RPCs or backend operations.

## 12. Database Security

The clean staging schema must explicitly define:

- Foreign keys.
- Nonnegative quantity constraints.
- Monetary constraints.
- Status constraints.
- Required uniqueness constraints.
- Required indexes.
- RLS enablement.
- RLS ownership policies.
- Admin policies.
- Function execution grants.
- `SECURITY DEFINER` behavior.
- Safe `search_path` handling.

Security-advisor findings must be classified individually. Intentional privileged functions should not be weakened merely to eliminate a warning.

Known staging hardening requirement from the audit:

```sql
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
```

Other privileged functions require explicit review based on their intended invocation path.

## 13. Backend/Worker Contract

The Worker is responsible for trusted application boundaries that cannot be delegated to untrusted browser code.

Important API responsibilities include:

- Authentication/session validation.
- Customer ownership validation.
- Paystack initialization.
- Paystack verification.
- Webhook handling.
- Calling privileged payment finalization logic through the approved service boundary.
- Controlled transactional email behavior.
- Input validation.
- Clear error responses without leaking secrets or privileged database information.

The Worker must not trust client-provided order totals, payment status, inventory state, or customer ownership.

## 14. Frontend Contract

The storefront must:

- Read catalogue data from the configured environment.
- Use authenticated customer identity where required.
- Persist cart changes through the approved cart service.
- Keep cart contents through failed/abandoned/cancelled payment paths.
- Remove purchased cart items only after successful payment finalization.
- Display authoritative inventory/availability values.
- Never hardcode production API origins into staging-specific application behavior.

The admin application must:

- Require authenticated administrator access.
- Load dashboard sections independently enough that one failed query does not incorrectly appear as an authentication failure.
- Use authoritative database counts for global metrics rather than interpreting a single paginated page as the total dataset.

## 15. Migration Contract

The clean staging migration chain must be created from an empty database.

Requirements:

- Unique sequential identifiers.
- Deterministic creation order.
- No duplicate migration prefixes.
- No blind reuse of the historical migration chain.
- No non-idempotent historical data conversion in the foundational schema.
- Explicit schema, indexes, constraints, RLS, functions, grants, and seed/configuration requirements.

Historical migrations remain reference material for behavior and intent. They must not be pushed blindly into staging as the new foundation.

## 16. Known Production-to-Repository Drift to Resolve in Staging

The reconstruction must explicitly resolve these audited inconsistencies:

1. Historical duplicate migration prefixes, including multiple `0014_*` and `0022_*` files.
2. The inventory semantics transition from old stock behavior to physical/reserved behavior.
3. Repository migration history versus live production migration tracking.
4. Repository `0022_featured_products.sql` versus the inspected production schema, which did not expose `products.is_featured`.
5. Live duplicate active-delivery unique indexes not represented by the historical migration names.
6. Stale storefront language referring to a free-delivery threshold after the migration history moved away from that model.
7. Payment initialization currently overwriting a payment reference instead of modeling immutable attempts.
8. Successful payment handling potentially sending duplicate emails when verification is repeated.
9. Admin dashboard counts based on a limited paginated product result.
10. Admin initialization coupling authorization failure with downstream data-loading failure.
11. Staging configuration currently requiring environment-specific Supabase/Worker values instead of production endpoints embedded in frontend code.

Each item must be resolved by an explicit staging design decision or implementation change rather than silently ignored.

## 17. Testing Contract

### Database

Test schema creation, constraints, foreign keys, inventory transitions, reservation lifecycle, payment lifecycle, order lifecycle, and idempotency.

### Supabase authorization

Use dedicated staging accounts to test:

- Own profile access.
- Cross-customer profile denial.
- Own cart access.
- Cross-customer cart denial.
- Own order access.
- Cross-customer order denial.
- Own reservation/payment access.
- Cross-customer reservation/payment denial.
- Customer denial of admin operations.
- Payment-status tampering denial.
- Protected RPC ownership checks.

### Worker/API

Test authentication, authorization, request validation, provider boundaries, error handling, idempotency, and database interaction.

### Playwright

Phase 4 browser tests should cover customer authentication/session behavior, storefront access, cart behavior, checkout behavior, order access, admin denial for customers, admin login, admin dashboard access, and customer/admin boundaries.

Full payment-provider and end-to-end business workflows remain part of the later full E2E phase where real provider behavior can be safely exercised in staging.

## 18. CI/CD Contract

The target promotion pipeline is:

```text
Commit
  ↓
Automated tests
  ↓
Build
  ↓
Staging deployment
  ↓
Staging verification
  ↓
Explicit production approval
  ↓
Production migration
  ↓
Production deployment
  ↓
Production smoke tests
```

Production promotion must be explicit, observable, and reversible.

## 19. Phase 4 Exit Criteria

Phase 4 reconstruction is complete when:

- Staging can be created from clean migrations.
- Schema and constraints pass.
- RLS and authorization tests pass.
- Customer isolation passes.
- Admin authorization passes.
- Inventory semantics pass.
- Reservation semantics pass.
- Payment state transitions pass.
- Payment finalization is idempotent.
- Cart behavior passes.
- Worker/API tests pass.
- Playwright Phase 4 tests pass.
- No unresolved critical security defect remains.
- Documentation matches implementation.
- CI reproduces the required validation steps.
