# FEATURES.md — Beulah Foods

Status legend: ⬜ not started · 🟨 in progress / configuration pending · ✅ implemented

Live-provider items remain 🟨 until production secrets and end-to-end tests are complete.

## Customer — Authentication
- ✅ Sign up / email confirmation flow
- ✅ Sign in / log in
- ✅ Log out
- ✅ Forgot password
- ✅ Reset password
- ✅ Maintain authenticated session

## Customer — Account
- ✅ View account
- ✅ Edit name
- ✅ Edit phone number
- ✅ Edit delivery address

## Customer — Shopping
- ✅ Browse live products
- ✅ Server-side product pagination
- ✅ View product details
- ✅ Add products to cart
- ✅ Change quantities
- ✅ Remove products
- ✅ View cart
- ✅ Proceed to trusted checkout

## Customer — Checkout
- ✅ Review products and quantities
- ✅ Review live subtotal
- ✅ Review database-controlled delivery fee/free-delivery rule
- ✅ Enter promo code
- ✅ Review database-calculated discount
- ✅ Review final payable amount
- ✅ Create trusted pending order and 15-minute reservation
- 🟨 Complete Paystack payment — provider secrets/configuration pending

## Customer — Orders / Payment
- ✅ Create a 15-minute reservation before payment
- 🟨 Initialize Paystack payment — implementation complete; production key/config pending
- 🟨 Complete payment through Paystack — live/test configuration pending
- 🟨 Verify payment server-side — implementation complete; live test pending
- ✅ Handle pending payment
- 🟨 Handle successful payment — implementation complete; live test pending
- 🟨 Handle failed payment — implementation complete; live test pending
- 🟨 Show final payment result screen — implementation complete; live test pending
- ✅ Trusted pending-order creation
- ✅ View own orders
- ✅ View individual order details

## Admin — Dashboard
- 🟨 Authenticated admin shell
- 🟨 Product/category/inventory overview metrics
- ⬜ Sales information
- 🟨 Order information foundation
- 🟨 Payment information foundation
- 🟨 Inventory information
- ⬜ Recent activity

## Admin — Authorization
- ✅ Explicit `admin_users` authorization table and database `is_admin()` helper
- ✅ Trusted-only admin provisioning boundary
- ✅ Admin login authorization check

## Admin — Products
- ✅ Add product
- ✅ Edit product
- ✅ Deactivate product
- ✅ Reactivate product
- 🟨 Delete product — UI deletion remains intentionally conservative until historical deletion policy is finalized
- ✅ Manage product information / pricing / availability
- ✅ Upload product images to Supabase Storage
- ✅ Replace product images
- ✅ Paginated product management

## Admin — Categories
- ✅ Create
- 🟨 Edit/manage existing categories
- ✅ Activate / deactivate

## Admin — Inventory
- ✅ View stock
- 🟨 Adjust stock through product management
- ✅ Low-stock information
- ✅ Product availability

## Admin — Orders
- 🟨 View orders
- ⬜ Search / filter orders
- ⬜ View individual admin order detail
- 🟨 View customer identity reference
- 🟨 Full delivery information view
- 🟨 Full order-item detail view
- 🟨 View payment status
- ✅ Manage operational order status through trusted database function
- ✅ Paginated order list

## Admin — Payments / Transactions
- 🟨 View payment records
- 🟨 View transaction/provider references
- 🟨 View payment status
- 🟨 Associate payments with orders through database relationship
- ✅ Paginated transaction list

## Admin — Customers
- ⬜ View customers
- ⬜ View customer details
- ⬜ View customer orders

## Admin — Promo Codes
- ✅ Create
- ✅ Edit
- ✅ Enable / disable
- ✅ Configure V1 discount rules
- 🟨 Production testing of limits and expiry

## Admin — Settings
- 🟨 Delivery fee and free-delivery threshold management
- ⬜ Other store configuration

## Infrastructure / Integration
- ✅ Trusted checkout boundary
- 🟨 Paystack integration — configuration/live testing pending
- 🟨 Server-side payment verification/webhook — configuration/live testing pending
- 🟨 Resend transactional email — API/domain configuration and live testing pending
- 🟨 Automatic reservation cleanup — migration includes `pg_cron` schedule; production confirmation pending
- ✅ Clean public storefront routes
