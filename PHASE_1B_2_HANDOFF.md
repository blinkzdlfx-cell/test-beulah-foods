# Beulah Foods — Production Handoff

The implementation pass is complete on `main`. The remaining work is external service configuration and live verification, not mock application data.

## Implemented

- Customer authentication/profile flow.
- Responsive storefront navigation.
- Live catalogue/category/product reads.
- Storefront pagination.
- Admin catalogue management.
- Admin product image upload/replacement through Supabase Storage.
- Delivery fee + free-delivery threshold controlled by Admin.
- V1 promo-code management and trusted checkout enforcement.
- Persistent cart.
- Trusted order creation and stock reservation.
- 15-minute reservation expiry cleanup via scheduled database job.
- Customer orders/order details.
- Admin order-status management.
- Admin order/transaction pagination.
- Paystack server-side initialization.
- Paystack signed webhook verification.
- Paystack server-side callback verification.
- Trusted payment finalization and stock reservation confirmation/release.
- Resend order confirmation email boundary.
- Static brand assets remain in `storefront/assets/`; product images do not.

## Migration order

Apply all of these to the production Supabase project in order:

1. `0001_customer_profiles.sql`
2. `0002_catalogue.sql`
3. `0003_shopping_foundation.sql`
4. `0004_admin_authorization.sql`
5. `0005_trusted_checkout.sql`
6. `0006_store_settings_promos_storage.sql`
7. `0007_paystack_trusted_payment.sql`
8. `0008_reservation_release_cron.sql`
9. `0009_harden_promo_visibility.sql`

Do not skip migrations or run them out of order.

## Values/configuration the owner must provide

### Supabase
- Production project URL.
- Production service-role key for the Cloudflare Worker secret only.
- Confirm email authentication/confirmation settings.
- Run the migrations above.
- Confirm `product-images` Storage bucket is public-read and admin-write after migration.

### Admin accounts
Create the two authorized Supabase Auth users, then provision each from a trusted context with `provision_admin(user_id, display_name)`. Do not expose this function to the browser.

Each admin has an independent Supabase Auth password. A password reset for one admin does not change the other admin.

### Paystack
- Paystack secret key as a Cloudflare Worker secret.
- Configure the Worker webhook URL:
  `https://<production-host>/api/paystack/webhook`
- Use Paystack test mode first for the complete E2E test.
- The application initializes transactions server-side and treats Paystack verification/webhooks as the payment source of truth.

### Resend
- Resend API key as a Cloudflare Worker secret.
- Verified sender/domain.
- `RESEND_FROM`, for example `Beulah Foods <orders@your-domain>`, once the domain is verified.
- Optional `ORDER_NOTIFICATION_EMAIL` for internal order notifications.

### Delivery
In Admin → Delivery settings, create the active rule:
- delivery fee below threshold
- free-delivery threshold

Nothing is hard-coded into checkout.

### Product images
Upload product images from Admin → Product catalogue. Accepted formats:
- JPG/JPEG
- PNG
- WebP

Maximum size: 5 MB.

The storefront resolves the Storage path into the public product image URL. Do not paste image URLs and do not put product images in the static asset directory.

## Required live E2E test

Run at least:

1. Customer signup and email confirmation.
2. Customer profile completion.
3. Admin login.
4. Admin product creation with image upload.
5. Verify image appears in Shop and Product detail.
6. Edit/replace the product image.
7. Verify storefront pagination.
8. Configure delivery fee and free-delivery threshold.
9. Create and activate a promo code.
10. Add products to cart.
11. Checkout with valid promo.
12. Confirm database-calculated subtotal, delivery, discount and total.
13. Pay with Paystack test mode.
14. Confirm signed webhook/server verification changes payment status to successful.
15. Confirm reservation changes to confirmed and reserved quantity is released from the reservation counter.
16. Confirm customer cart clears only after verified payment success.
17. Confirm order appears in My Orders.
18. Confirm Resend confirmation email.
19. Test payment failure/expiry and verify stock is restored.
20. Test promo usage limit and minimum order enforcement.

## Production boundary

The repository is implementation-ready, but production should not be declared complete until the external secrets/configuration above are supplied and the live E2E checklist passes. Never commit service-role, Paystack secret, or Resend API keys to GitHub.
