# DEVELOPMENT.md — Beulah Foods

## The rule for every feature

```
PLAN → IMPLEMENT → CONNECT REAL DATA/SERVICE → TEST → FIX → VERIFY
```

Work **feature by feature** — don't start a second feature while the
current one is broken. Don't build the whole application and test it all
at the end; test as you go.

If a feature needs a business decision that hasn't been made yet (a fee
amount, a discount rule, which payment provider to use, etc.), **stop and
ask** instead of guessing. Guessing here means someone has to un-guess it
later, usually after real customers have hit it.

## Running the project locally

Because this is plain HTML/CSS/JS with no build step, "running" it just
means serving the folder over HTTP (opening the HTML file directly with
`file://` will break ES module imports and Supabase auth redirects, so
always use a local server). Any of these work — use whichever is already
on the machine you're on:

- VS Code's "Live Server" extension
- `npx http-server` (uses npm only to fetch a static file server — this
  is a dev convenience, not a build step or production dependency)
- Python's built-in server: `python3 -m http.server`

**What success looks like:** you can open `http://localhost:<port>/storefront/`
and `http://localhost:<port>/admin/` in a browser and both load without
console errors, independently of each other.

## Connecting Supabase

1. **Create a Supabase project** (if one doesn't exist yet) at
   supabase.com — this is where the real product, order, and customer
   data will live.
2. From the project's Settings → API page, copy the **Project URL** and
   the **anon/public key**.
3. Put those two values into `storefront/js/lib/supabaseClient.js` and
   `admin/js/lib/supabaseClient.js` (each area configures its own
   client). The anon key is safe to have in this browser file — see
   `ARCHITECTURE.md` for why.
4. **Never** put the service role key in either of those files, or in
   any file that ships to the browser.

**What success looks like:** a page can call `supabase.from('products').select()`
(or similar) and get real data back — not a mock array, not an error.

## Testing as you build

For each feature, before moving on:

- The happy path works against real Supabase data (not a hardcoded
  example).
- Errors are visible somewhere a person would actually see them (not just
  logged to the console) — a form shows "that email is already in use,"
  a broken image doesn't leave a blank product card.
- Refreshing the page doesn't lose state that should survive a refresh
  (e.g. being logged in, items in the cart).

## Folder discipline

- Don't create a file for a feature that isn't being built yet.
- Don't leave placeholder/example files lying around once the real thing
  exists.
- If something doesn't fit `js/lib`, `js/services`, `js/components`,
  `js/pages`, or `js/utils`, that's a sign to ask before inventing a new
  category, not to guess where it goes.
