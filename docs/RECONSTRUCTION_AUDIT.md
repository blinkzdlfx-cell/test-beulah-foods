# Beulah Foods — Reconstruction Audit

**Status:** Initial audit recorded  
**Source repository:** `blinkzdlfx-cell/Beulah-foods@main`  
**Target repository:** `blinkzdlfx-cell/test-beulah-foods@reconstruction`

## 1. Audit rule

Production is treated as an evidence source. It is not modified during reconstruction. Staging is the implementation and validation environment.

Findings are classified as:

- **Evidence** — directly observed in repository/database evidence.
- **Recommendation** — proposed correction or target behavior.
- **Human Decision** — requires explicit approval before a consequential production change.

## 2. Architecture confirmed

The Cloudflare Worker is not merely a static host. The application Worker combines:

1. Static asset hosting and route handling.
2. Trusted payment API behavior.

Production Worker routes include Paystack initialization, verification, and webhook handling. The Worker also uses server-side Supabase and Paystack credentials. This means staging requires an independent Worker environment and independent secrets.

Target architecture:

```text
Browser
  ├── Supabase Auth
  ├── Supabase DB / RLS / RPC / Storage
  ├── Worker payment API
  └── Worker static hosting/routing
          │
          └── Paystack
```

## 3. Environment separation finding

Production storefront and admin Supabase clients currently contain the production Supabase URL and browser anon key. Staging must replace these with staging configuration. The service-role key must never enter browser code.

The homepage also contains production Worker origins in canonical/structured-data values. These must be environment-aware before staging deployment.

## 4. Database reconstruction finding

The production repository contains a historically evolved migration chain with duplicate numeric prefixes, including multiple `0014_*` and `0022_*` files. The repository migration chain is therefore not suitable as the clean staging foundation.

Historical migrations will be retained as reference material where available, but staging will receive a new deterministic migration chain created from the audited requirements and verified live schema behavior.

## 5. Inventory finding

The later inventory migration defines:

```text
physical stock = products.stock_quantity
reserved stock = products.reserved_quantity
available stock = stock_quantity - reserved_quantity
```

Reservation creation holds stock through `reserved_quantity`. Successful payment consumes physical stock. Cancellation/expiry releases held stock without consuming physical stock.

The historical conversion migration is non-idempotent and therefore must not be replayed as a foundational staging migration.

## 6. Payment finding

The current Worker creates a new Paystack reference during each initialization attempt and patches the existing payment record with that reference. This is unsafe for an immutable-attempt model because a previous provider reference can be overwritten.

Target behavior:

```text
one payment attempt → one immutable provider reference
retry → new payment attempt/reference
```

Webhook and verification finalization must be idempotent. Transactional email must occur only on the actual transition requiring the email, not on repeated verification of an already-finalized payment.

## 7. Cart finding

The current cart service contains mutation-version and serialized database-persistence protection. This should be preserved in staging.

The target contract remains:

```text
authenticated database cart = source of truth
localStorage = cache/convenience
```

Cart items should remain after failed, abandoned, expired, or cancelled checkout and be removed only after successful payment finalization.

## 8. Admin finding

The admin application currently couples `requireAdmin()` and dashboard data loading in one initialization try/catch. A downstream data query can therefore present as an authorization failure.

The dashboard also has pagination-related counting limitations. Global metrics should come from authoritative database summaries rather than the current page of products.

## 9. Catalogue/schema finding

The production repository contains `0022_featured_products.sql`, which adds `products.is_featured`, and the storefront catalogue service queries `is_featured`. The inspected live production schema did not expose that column at audit time.

This is a concrete repository/live-schema drift item. Staging must explicitly decide whether featured products are part of the target contract and then implement the schema and application consistently.

## 10. Reservation retry finding

The reservation retry guard performs a direct active-reservation lookup before calling the ownership-protected retry RPC. This lookup is not an authorization bypass, but it is broader than necessary and should be cleaned up so the trusted RPC remains the clear ownership boundary.

## 11. Delivery/content finding

Historical migration behavior moved away from the previous free-delivery-threshold model, while stale storefront language still references free-delivery behavior. Staging content and business logic must use one authoritative delivery contract.

## 12. Security finding

RLS is enabled across the principal customer/business tables. Several SECURITY DEFINER functions exist intentionally for trusted workflows, so security-advisor warnings must be reviewed individually rather than disabling privileged behavior blindly.

One confirmed hardening action for staging is:

```sql
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
```

Other function grants require review against the final invocation model.

## 13. Reconstruction state

At the start of this checkpoint, the staging `reconstruction` branch contained the clean rebuild plan and system specification. A controlled source-reconstruction utility and manual workflow have now been added so the production application source and assets can be copied without replacing staging documentation or the clean migration directory.

The utility deliberately excludes historical production migrations, production Worker configuration, production CI workflows, and staging-owned documentation.

## 14. Next implementation checkpoint

After source reconstruction:

1. Verify source inventory against production.
2. Introduce environment configuration for staging.
3. Create the clean migration chain.
4. Apply it to staging Supabase.
5. Seed only approved staging data.
6. Configure staging Worker and secrets.
7. Run database/RLS/API tests.
8. Run Playwright customer/admin tests.
9. Record all results and defects here and in the relevant implementation documents.

No production deployment is part of this checkpoint.
