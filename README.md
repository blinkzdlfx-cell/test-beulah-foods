# Beulah Foods

Food-products e-commerce site. Static HTML/CSS/vanilla-JS storefront and
admin dashboard, backed by Supabase.

Start with `PROJECT.md`, then `ARCHITECTURE.md` and `RULES.md` before
touching any code — this applies to humans and AI agents alike.

## Quick start

1. `cd storefront` (or `cd admin`) and serve the folder with any static
   file server — see `DEVELOPMENT.md` for options.
2. Fill in your Supabase project URL and anon key in
   `js/lib/supabaseClient.js` in each of `storefront/` and `admin/` —
   see `DEVELOPMENT.md` for exactly where to find them.
3. Open the page in a browser.

## Folder structure

```
beulah-foods/
├── storefront/   customer-facing site
├── admin/        staff dashboard
└── supabase/     backend notes (schema, Edge Functions — to be added)
```
