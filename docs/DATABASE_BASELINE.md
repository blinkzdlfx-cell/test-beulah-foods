# Beulah Foods — Clean Database Baseline

## Baseline identity

- Staging project: `cveghsjotmfygknqyvxg`
- Migration name: `clean_baseline`
- Applied staging migration version: `20260915080245`
- Application tables: 12
- Application rows at baseline: 0
- RLS enabled on all 12 application tables.

## Tables

1. `customer_profiles`
2. `categories`
3. `products`
4. `orders`
5. `order_items`
6. `reservations`
7. `payments`
8. `admin_users`
9. `delivery_settings`
10. `promo_codes`
11. `customer_carts`
12. `customer_cart_items`

## Core invariants

- Customer profiles, orders and carts reference `auth.users`.
- Order items reference orders and products.
- Reservations are one-per-order.
- Customer carts are one-per-customer.
- Customer cart items are unique per cart/product.
- Product physical stock is represented by `stock_quantity`.
- Active holds are represented by `reserved_quantity`.
- `stock_quantity >= reserved_quantity` is enforced.
- Monetary values used by checkout are non-negative.
- Order, reservation and payment states are constrained to known values.
- Paystack provider references are unique when present.
- Order numbers are generated from `beulah_order_number_seq` and are unique.
- Only one delivery-settings row may be active.
- Promo codes are unique case-insensitively and have a single active-code constraint.

## Trusted database operations

The baseline includes the application RPCs required by the reconstructed application:

- `create_pending_order`
- `cancel_pending_order`
- `retry_expired_pending_order`
- `release_expired_reservations`
- `finalize_paystack_payment`
- `admin_update_order_status`
- `provision_admin`
- `get_customer_cart`
- `set_customer_cart`
- `merge_customer_cart`
- `is_admin`

Security-definer functions use an explicit `search_path` where appropriate. Payment finalization is restricted to the trusted `service_role` path, and `is_admin(uuid)` is not executable by `anon`.

## RLS baseline

The staging baseline reproduces the application's required access model:

- Customers can read/update their own profile.
- Customers can read only their own orders, order items, reservations, payments and cart data.
- Public users can read active catalogue/category/delivery configuration data.
- Authenticated admins can manage catalogue, delivery settings and promo codes.
- Authenticated admins can read all orders, order items, reservations and payments.
- Admin users can read their own admin record.
- Direct customer writes to orders, payments and reservations are not granted; business mutations occur through trusted RPCs.

## Historical migration policy

The 26 historical production migration files are not the staging migration chain. Their duplicate prefixes and evolved semantics are treated as audit/reference material.

The staging baseline is deliberately clean and starts from an empty database. Future schema changes must use unique, reviewed migration names and must include validation/tests for the affected behavior.

## Known follow-up work

The current baseline mirrors the reconstructed application's current payment schema so Phase 4 can establish a functional connection. Immutable payment-attempt handling remains a planned business-flow hardening task for later reconstruction phases.
