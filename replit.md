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

### Test scripts (need to be added to `package.json` manually)
The agent is forbidden from editing `package.json`. Please add the following entries to the `scripts` block to enable the testing workflow:

```jsonc
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"verify": "npm run check && npm test"
```

In the meantime, you can run the suite directly with:
- `npx vitest run` — single run (CI-style).
- `npx vitest` — watch mode during development.
- `npx vitest run --coverage` — coverage report.

## Notes
- The Vite + Express setup lives in `vite.config.ts` and `server/vite.ts` and must not be modified. There is a known preexisting `tsc` error in `server/vite.ts` (`allowedHosts: boolean` vs the new Vite type) that is unrelated to the test work; runtime is unaffected.
- New tests should be placed in `tests/` and end in `.test.ts` to be picked up by Vitest.
