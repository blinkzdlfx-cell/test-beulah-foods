# DESIGN.md — Beulah Foods

## Storefront

The storefront should feel:

- Modern and polished
- Food-focused
- Premium but approachable — not cold or corporate
- Mobile-first, but desktop should feel like it was designed for a
  bigger screen, not just a stretched phone layout
- Responsive across common breakpoints
- Visually clean and easy to navigate

**On color:** Beulah Foods branding can use green as an accent, but
don't lean on it everywhere. Bring in neutral tones (off-whites, warm
grays, deep neutrals) and one or two complementary accent colors so the
interface feels considered rather than like a default "green food brand"
template.

## Admin dashboard

The admin dashboard should feel:

- Professional and functional
- Optimized for getting management tasks done quickly — dense
  information, clear tables, obvious actions — rather than "pretty" in
  the storefront sense
- Visually distinct enough from the storefront that nobody mistakes an
  admin screenshot for the customer site

## How styling is implemented

- Plain CSS only — no Tailwind, no CSS framework.
- Use **CSS variables** for colors, spacing, and type scale, defined once
  and reused, so a color or spacing change doesn't mean hunting through
  every file.
- Use **reusable classes** (e.g. `.btn`, `.card`, `.badge`) instead of
  repeating the same style rules across pages.
- Storefront and admin each define their own variables/classes — they're
  allowed to look related, but neither should silently depend on the
  other's CSS file existing.

**What success looks like:** changing a single CSS variable (e.g. the
primary accent color) visibly updates it everywhere it's used, without
editing multiple files.
