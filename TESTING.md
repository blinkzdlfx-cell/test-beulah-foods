# Beulah Foods — Testing & Verification Plan

## Purpose

This document records the seven-phase testing plan for Beulah Foods. The goal is to verify that the implementation follows the project's documented architecture, business rules, and feature contracts.

The testing workflow follows the project's existing development principle:

`PLAN → IMPLEMENT → CONNECT REAL DATA/SERVICE → TEST → FIX → VERIFY`

## Seven phases

| Phase | Scope | Status |
|---|---|---|
| 1 | GitHub Actions foundation and repository baseline checks | 🟩 Complete |
| 2 | Project checks: dependencies/scripts, linting, formatting, and static validation | 🟩 Complete |
| 3 | Unit and integration tests for application/business logic | 🟩 Complete |
| 4 | Supabase/database tests: schema, RLS, RPCs, constraints, and business rules | ⬜ Not started |
| 5 | Cloudflare Worker and API tests, including payment/email boundaries | ⬜ Not started |
| 6 | Browser end-to-end tests with real project workflows | ⬜ Not started |
| 7 | Unified `test:all` verification and CI quality gate | ⬜ Not started |

## Phase 1 — GitHub Actions foundation

### Objective

Create an independent CI check that runs on pushes and pull requests and establishes a clean baseline before deeper test tooling is introduced.

### Initial checks

- Repository checkout succeeds.
- Required project documentation exists.
- Locked application areas exist.
- JavaScript files pass Node syntax checking.
- Obvious forbidden framework/build-tool references in application source are detected.
- A service-role secret is not present in browser-facing source.

### Exit criteria

Phase 1 is complete when:

1. `.github/workflows/test.yml` exists and runs successfully on GitHub Actions.
2. The baseline checks pass on the current repository.
3. The seven-phase plan is committed and tracked in this file.
4. Any baseline failure is fixed or explicitly documented before Phase 2 begins.

## Phase 2 — Project checks

### Objective

Verify the repository's development tooling, linting, formatting, and static validation before application behavior tests are expanded.

### Exit criteria

Phase 2 is complete when the project checks pass successfully on the merged `main` branch.

## Phase 3 — Unit and integration tests

### Objective

Add executable tests for application/business logic using Node's built-in test runner. Tests should verify documented behavior and remain independent of browser UI and external service availability unless the behavior specifically requires integration coverage.

### Initial coverage

- Stateless form validation helpers.
- Cart data normalization and item-count behavior.
- Checkout cart-retention and checkout-state contracts.
- Pricing and discount calculation contracts.
- Reservation lifecycle and expiry contracts.
- Payment client boundary contracts.
- Order lifecycle contracts.
- Cart database persistence ordering and stale-response protection.

### Rules

- Prefer Node's built-in test runner over introducing a testing framework.
- Test business behavior rather than private implementation details.
- Do not replace real Supabase behavior with fake tests where database behavior is the contract; those cases belong in Phase 4.
- Do not add mock business data to production code merely to enable tests.

### Exit criteria

Phase 3 is complete when:

1. The unit/integration test suite runs successfully in CI.
2. Core application/business logic identified in the project documentation has meaningful coverage.
3. Known defects exposed by the tests are fixed or explicitly documented.
4. The Phase 3 CI workflow passes on the branch intended for merge.

## Rules for progressing phases

- Complete the current phase before starting the next.
- Do not add tests that contradict `PROJECT.md`, `ARCHITECTURE.md`, `RULES.md`, `FEATURES.md`, or `AGENTS.md`.
- Prefer tests of documented behavior and business contracts over implementation details.
- Do not introduce a framework or build tool merely to make testing easier.
- Real Supabase-backed behavior must be used for integration/E2E verification where the documentation requires real data.
- A phase is not complete merely because its tooling is installed; its exit criteria must be satisfied.

## Phase completion record

### Phase 1

- Started: 2026-09-13
- CI workflow: `.github/workflows/test.yml`
- Current state: Complete
- Completion commit: `2067f0d270d6e47b6ff146d89ae559c2b2bf8c68`

### Phase 2

- CI workflow: `.github/workflows/phase2.yml`
- Current state: Complete
- Completion commit: `c671901fe3f1af9bfaba4d2b1a506df6f8831465`

### Phase 3

- Started: 2026-09-13
- CI workflow: `.github/workflows/phase3.yml`
- Current state: Complete
- Test suite: `tests/unit/*.test.js`
- Merge commit: `881b6926c8c3864abfb8e6d29162e8cbe2ff3ca8`
- Completion documentation commit: `874aeeb00397ee5fe65039fa6c8196e6f3aeb8c7`

### Phase 4

- Completion commit: pending

### Phase 5

- Completion commit: pending

### Phase 6

- Completion commit: pending

### Phase 7

- Completion commit: pending
