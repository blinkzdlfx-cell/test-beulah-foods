# Supabase — Beulah Foods

This folder holds notes and (once decided) SQL for the Supabase project
that backs both `/storefront` and `/admin`. Nothing here runs
automatically yet — it's documentation and future migration files.

## What belongs here later

- Database schema / migrations (products, categories, orders, order
  items, reservations, payments, promo codes, customers, announcements,
  testimonials, store settings)
- Row Level Security (RLS) policies
- Edge Functions for privileged logic — e.g. final checkout total
  calculation and payment verification (see `../ARCHITECTURE.md` for why
  this can't live in browser JavaScript)

## Migrations

SQL files in `migrations/` are meant to be run in order, either by
pasting them into the Supabase dashboard's SQL editor or via the
Supabase CLI. They are not run automatically by anything in this repo.

| File | What it does |
|---|---|
| `migrations/0001_customer_profiles.sql` | Customer profile table (name, phone, address) + RLS policies + auto-create-on-signup trigger. Auth identity itself lives in Supabase's built-in `auth.users` — this migration never touches passwords. The trigger fires for every new `auth.users` row (no client-supplied role check) — safe while the only signup path is the customer one; **must be revisited when admin authorization is designed**, see the comment in the migration file. It also copies `full_name` from signup into the profile — that field is safe to trust from the browser, unlike role/permissions. |

## Customer authentication UI

`storefront/signup.html`, `storefront/login.html`, and the session-aware
header on every storefront page (`storefront/js/components/navbar.js`)
are built and use `authService.js` exclusively — no page talks to
Supabase directly.

**Email confirmation is required** by this feature's design. That means:
after signup, Supabase returns no session until the customer clicks the
link in their confirmation email — the signup page reflects that
(“check your email”) rather than assuming they're logged in.

**Confirmation link destination:** by default, Supabase sends customers
to the project's configured **Site URL** after they click the
confirmation link. Because the Supabase client has `detectSessionInUrl`
on by default, whichever page they land on will automatically pick up
the new session — there's no separate "confirm" page in this repo to
build. Point the Site URL at the storefront's root (e.g.
`http://localhost:<port>/storefront/` in development) so that works.

## Forgot password / reset password

`storefront/forgot-password.html` and `storefront/reset-password.html`
(with `storefront/js/pages/forgot-password.js` and
`storefront/js/pages/reset-password.js`) are built and, like the rest of
customer auth, use `authService.js` exclusively —
`requestPasswordReset()` and `updatePassword()`, both of which already
existed in that file before this feature.

**How it works:**

1. On `forgot-password.html`, the customer enters their email.
   `requestPasswordReset()` calls
   `supabase.auth.resetPasswordForEmail(email, { redirectTo })`, where
   `redirectTo` is built at runtime from the page's own URL
   (`new URL("reset-password.html", window.location.href)`) — so it
automatically points at `http://localhost:<port>/storefront/reset-password.html`
   in development and at the real domain once deployed, with no
   hardcoded host.
2. The confirmation message is intentionally the same whether or not
   the email belongs to an account ("If an account exists for…") —
   `resetPasswordForEmail` itself doesn't reveal whether an email is
   registered, and the UI shouldn't leak that either.
3. Supabase emails the customer a recovery link. Clicking it redirects
   them to `reset-password.html` with recovery tokens attached (either
   in the URL fragment or as a `?code=`, depending on the project's
   auth flow settings) — the same `detectSessionInUrl` behavior already
   relied on for the signup confirmation link (see above).
4. `reset-password.js` listens for the Supabase `PASSWORD_RECOVERY`
   auth event, which fires once the client has exchanged that link for a
   (recovery-scoped) session. Only then does it reveal the "set new
   password" form. If the link is invalid or expired, Supabase redirects
   back with error details in the URL instead — the page reads those
   and shows an error state with a link back to `forgot-password.html`.
   A short timeout also covers the case where no event and no URL error
   ever arrive.
5. Submitting the form calls `updatePassword()`
   (`supabase.auth.updateUser({ password })`) on that recovery session.
   No password-complexity rule is enforced client-side beyond "both
   fields match" — if Supabase's own minimum (currently 6 characters by
   default) isn't met, its error message is shown as-is rather than a
   guessed rule.

**Redirect URL configuration required (development and deployment):**

Supabase only allows redirecting to URLs it's been told about — this is
what needs to be set for the reset link to actually land on
`reset-password.html` instead of being rejected:

- **Authentication → URL Configuration → Redirect URLs**: add
  `http://localhost:<port>/storefront/reset-password.html` for local
  development (matching whatever port the static server actually runs
  on), and the deployed equivalent, e.g.
  `https://<your-domain>/storefront/reset-password.html`, once hosted.
  Wildcards are supported if the port varies
  (`http://localhost:*/storefront/reset-password.html`).
- This is in addition to — not instead of — the **Site URL** already
  documented below for the signup confirmation link. Both need to be
  set; they serve different links.

## Customer authentication — setup still required

Code and SQL are ready, but a few things can only be done from the
Supabase dashboard by a human:

1. **Create a Supabase project**, if one doesn't exist yet
   (supabase.com → New project).
2. **Run `migrations/0001_customer_profiles.sql`** in the SQL editor
   (Dashboard → SQL Editor → paste → Run).
   *What success looks like:* a `customer_profiles` table appears
   under Table Editor, with RLS shown as "Enabled."
3. **Confirm the Email provider is on** under Authentication →
   Providers → Email. It's on by default, but worth checking since
   this project's whole auth model depends on it.
4. **Turn ON email confirmation** (Authentication → Providers → Email →
   "Confirm email"). This feature is built assuming confirmation is
   required — if it's off, signup will behave differently than the UI
   describes (the customer would get a session immediately instead of
   seeing "check your email").
5. **Set the Site URL** (Authentication → URL Configuration) to the
   storefront's URL — e.g. `http://localhost:<port>/storefront/` in
   development — so confirmation email links land somewhere that
   actually picks up the new session. Add the same URL (or `login.html`,
   `signup.html`) under Redirect URLs if Supabase requires an exact
   match.
6. **Add `reset-password.html` under Redirect URLs** (Authentication →
   URL Configuration → Redirect URLs) — e.g.
   `http://localhost:<port>/storefront/reset-password.html` in
   development, plus the deployed equivalent later. See "Forgot
   password / reset password" above for why this is separate from the
   Site URL in step 5.
7. **Copy the Project URL and anon key** (Settings → API) into
   `storefront/js/lib/supabaseClient.js`, replacing the placeholder
   values.

None of the above was invented or assumed complete — steps 3–6 are
standard Supabase project settings, not business rules, but they still
need a human to actually click them.

## Reminder

The **service role key** for this Supabase project must never be
committed here, or anywhere in this repo. Edge Functions get it from
Supabase's own environment/secrets, not from a file in this repository.
