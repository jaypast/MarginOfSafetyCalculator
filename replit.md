# Margin of Safety Calculator

A value-investing web app that estimates intrinsic stock value via DCF, P/E, and Graham methods, then derives a "buy below" price using a configurable margin of safety.

## Stack
- **Frontend**: React + Vite, TanStack Query, wouter, shadcn/ui, Tailwind
- **Backend**: Express + TypeScript on a single port (Vite middleware in dev)
- **DB**: Drizzle ORM + Postgres (Neon serverless) with an in-memory fallback
- **Tests**: Vitest (`npm test`, `npm run verify`)

## Project layout
- `client/src/lib/calculators.ts` — DCF / P/E / Graham math. Each method exports both a `*Detailed` (returns `{ value, appliedAdjustments[] }`) and a thin number-returning wrapper.
- `client/src/lib/companyAdjustments.ts` — Per-industry caps and special-case overrides used by the calculators.
- `client/src/lib/researchCalculations.ts` — Shared valuation pipeline used by the research/news views.
- `client/src/components/MarginOfSafetyCalculator.tsx` — Top-level calculator UI.
- `client/src/components/StockInformation.tsx` — Search box + data-source / freshness badge.
- `client/src/components/ValuationResults.tsx` — Method comparison table + "Applied adjustments" panel.
- `server/services/stockData.ts` — Tiered data fetch (yfinance → RapidAPI → Alpha Vantage → web scrape → static fallback) with provenance stamping.
- `shared/schema.ts` — Zod + Drizzle schemas. Source of truth for `StockResponse`, `DATA_SOURCES`, etc.
- `tests/*.test.ts` — Vitest suite (calculators, adjustments, research pipeline, storage, schema).

## Data provenance
Every `/api/stock/:symbol` response is stamped with:
- `dataSource` — one of `yfinance | rapidapi | alpha-vantage | web-scrape | fallback | unknown`
- `fetchedAt` — ISO timestamp of when the server returned the payload
- `appliedAdjustments` — list of human-readable notes about derivations (e.g. `EPS derived from price ÷ P/E`).

The UI surfaces these as badges on the search card so the user can judge how trustworthy the headline numbers are.

## Valuation hardening (Task #9)
Recent fixes:
- Removed hard-coded `5year=18.6 / 10year=16.2 / industry=22.5` P/E branches. Only `current` and `custom` modes remain — neither lies about per-stock data.
- Japanese price floor (was unconditionally raising every `.T` listing to 65–70 % of current price) is now opt-in via `ValuationParams.applyJapanFloor`.
- `calculateAverageValuation` now takes `currentPrice` as a required argument instead of reverse-engineering it from `discountPremium` (which silently produced wrong recommendations whenever one method was capped).
- TSLA's classification as `AUTO_MANUFACTURER` is documented; the previous "duplicate" was just an undocumented intentional choice.
- Removed the `7xxx.T → AUTO_MANUFACTURER` heuristic that was misclassifying Nintendo (7974.T), Mitsubishi Heavy (7011.T), Hoya (7741.T) and others.

## Scripts
- `npm run dev` — start the Express + Vite dev server.
- `npm run check` — run `tsc` for type errors.
- `npm run db:push` — push Drizzle migrations.

### Test & verify (Replit workflows)
Two on-demand workflows are configured for the test suite:

- **Test** — `npx vitest run` (one-shot, console output).
- **Verify** — `npx tsc --noEmit && npx vitest run` (CI-equivalent
  pre-deploy gate).

Both are non-auto-start: open the Workflows panel and click ▶ to run on
demand. From the shell you can run them directly:
- `npx vitest run` — single run (CI-style).
- `npx vitest` — watch mode during development.
- `npx vitest run --coverage` — coverage report.
- `npx tsc --noEmit && npx vitest run` — full pre-deploy gate.

## Test layout
- `tests/calculators.test.ts` — unit tests for DCF / P/E / Graham including
  cap regressions and the Japan-floor opt-in.
- `tests/companyAdjustments.test.ts` — industry mapping, special cases, the
  removed `7xxx.T → AUTO` heuristic.
- `tests/researchCalculations.test.ts` — end-to-end research pipeline.
- `tests/schema.test.ts` — Zod schema validation.
- `tests/storage.test.ts` — exercises the production `MemStorage` class
  (with `server/db` mocked to `null`) for the Sean Ellis PMF math.
- `tests/goldenValues.test.ts` — locked-in intrinsic values for AAPL, JPM,
  Ford, Toyota (7203.T) and a loss-making company. Any math change that
  shifts a number by more than $0.01 trips these tests.
- `tests/properties.test.ts` — property-based tests (fast-check) for
  invariants like "DCF/P/E/Graham never exceed `priceToCap × price`",
  "buy-below is always strictly less than intrinsic value", and
  cross-source comparison symmetry.
- `tests/crossSource.test.ts` — divergence-detection logic that powers
  the `CROSS_SOURCE_DIVERGENCE` warn logs in `server/services/stockData.ts`.
- `tests/adapters.test.ts` — adapter normalization tests for each provider
  module (yahooFinance subprocess, RapidAPI, Alpha Vantage, web scraper).
  Each test mocks the upstream (axios/fetch/exec), feeds a canned payload,
  and asserts the result passes `stockResponseSchema.safeParse`. Catches
  upstream API field-name drift before users see NaN-filled responses.

## Notes
- The Vite + Express setup lives in `vite.config.ts` and `server/vite.ts`. The
  one-line `allowedHosts: true as const` in `server/vite.ts` is required to
  satisfy the newer Vite typings — leave it alone.
- New tests should be placed in `tests/` and end in `.test.ts` to be picked up by Vitest.
- When the primary stock-data source returns complete data, a non-blocking
  secondary source is fetched and compared. Any field that diverges by more
  than 15% logs `CROSS_SOURCE_DIVERGENCE` to stderr (single-line, greppable).
