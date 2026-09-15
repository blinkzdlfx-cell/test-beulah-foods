# RULES.md — Beulah Foods

These are hard rules. If a rule and a feature request conflict, the rule wins — stop and ask rather than breaking it.

## Core principles

1. No mock production data.
2. No fake APIs.
3. No hardcoded production products or prices.
4. Real Supabase data must be used when implementing functionality.
5. Do not invent business rules.
6. Do not silently change architectural decisions.
7. Keep customer and admin areas separated.
8. Keep the folder structure simple and understandable.
9. Build and test incrementally.
10. Do not build the entire application and wait until the end to test it.
11. When a feature requires database functionality, connect it to real Supabase-backed logic.
12. Do not add dependencies unless there is a concrete technical reason.
13. Preserve existing decisions and conventions.
14. Do not modify unrelated features.

## Products

- Products are controlled by the admin.
- Prices must come from the database — never hardcoded in the storefront.
- The storefront displays live product data from Supabase.
- Inactive/deactivated products are not purchasable by customers.
- Product images are uploaded by Admin to the Supabase Storage `product-images` bucket. Product image URLs must not be manually pasted into product records.
- Static brand assets such as logo/favicon may remain in the repository assets folder.
- Deleting/deactivating a product must not erase or corrupt historical order snapshots.

## Pricing, delivery and promos

- Product pricing and delivery settings are admin-controlled.
- Delivery fee and free-delivery threshold are stored in the database; checkout must never hard-code them.
- Promo codes are admin-controlled and database-enforced.
- V1 promo rules: percentage/fixed discount, minimum order, optional maximum discount, start/end dates, usage limit and activation state.
- The final payable amount is calculated by trusted database logic, not solely by client-side JavaScript.
- Don't invent additional fee types, tax rules, delivery formulas, or promo rules without approval.

## Reservations and payment

Reservation duration is **fixed at 15 minutes**. Flow:

```
Checkout → Create reservation → 15-min window → Initialize Paystack
  → Customer pays → Webhook/server verification → SUCCESS or FAILED
```

- Paystack is the locked payment provider.
- Paystack secret keys are server-only Cloudflare Worker secrets.
- The browser redirect after payment is never treated as proof of success.
- Payment status and order status are separate concepts.
- Payment finalization occurs through the trusted payment path.

**Payment states:** `pending`, `successful`, `failed`
**Reservation states:** `active`, `expired`, `confirmed`

After verified successful payment:
`payment = successful`, `reservation = confirmed`, `order = paid`.

Normal order progression after that: `paid → processing → completed`.

If payment fails, the trusted payment path marks the payment failed and releases an active reservation when applicable.

Admins can update operational order status, but ordinary order-status editing must never falsely flip payment status.

## Security

- Enforce security through Supabase authentication and authorization/database policies (RLS), not by hiding buttons in the UI.
- The Supabase service-role key never appears in browser code, in `/storefront`, in `/admin`, or in the repo.
- Paystack secret and Resend API keys are also server-only Worker secrets.

## Admin permissions

- Admin manages products, product images, categories, inventory, delivery settings, promo codes, orders, and payment records.
- Admin can update operational order status, but not payment status directly.
- Do not invent additional admin permissions or roles beyond the approved two-admin model without asking.
