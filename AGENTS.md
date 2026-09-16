# AGENTS.md — Instructions for AI coding agents

This file is for any AI coding agent working in this repository (Claude,
Claude Code, OpenCode, Kilo Code, or any other assistant/editor). Read
this before making changes.

## Read first

- `PROJECT.md` — what this is
- `ARCHITECTURE.md` — the locked tech stack, don't deviate from it
- `RULES.md` — hard rules, treat as non-negotiable
- `DEVELOPMENT.md` — the workflow to follow for every feature
- `DESIGN.md` — visual direction
- `FEATURES.md` — the scope, and what's already built vs. not

## Non-negotiables

- Stack is locked to HTML5, plain CSS, vanilla JavaScript (ES modules
  allowed), and Supabase. Do not introduce a framework, CSS framework,
  or build tool, even temporarily, even if it would be faster.
- Never write the Supabase **service role** key into any file under
  `/storefront` or `/admin`.
- Never invent a business rule (a fee amount, a discount formula, a
  permission, a payment provider) that isn't written in `RULES.md` or
  `FEATURES.md`. If a feature needs one, stop and ask instead of
  guessing — say specifically what decision is needed.
- Never use mock/fake data for a feature that's actually being
  implemented. Mock data is only acceptable while explicitly told a
  feature is not yet connected to Supabase.
- Work one feature at a time: plan → implement → connect real data →
  test → fix → verify. Don't start the next feature while the current
  one is broken.
- Don't touch files unrelated to the feature you're working on.
- Don't restructure folders or rename established files "for
  cleanliness" without flagging it first — that's an architectural
  change, not a feature change.

## When you're not sure

If something in a task conflicts with these docs, or a task requires
information that isn't written down anywhere in this repo, stop and ask
a clarifying question rather than making an assumption. State plainly
what decision you need and why — don't silently pick one and move on.

## Reporting back

After finishing a task, report plainly:
- What files were created or changed
- What was tested, and how
- Anything still undecided that needs a human call
