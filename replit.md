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
- `client/src/lib/multibaggerScreener.ts` — pure scoring module (Yartseva 2025 factor exposures) consumed by the Multibagger Screener panel and the Watchlist score column.
- `client/src/components/MultibaggerScreener.tsx` — descriptive 0–100 sub-score breakdown + composite badge rendered below the Value-Investor Verdict.
- `client/src/components/ValueInvestorVerdict.tsx` — Graham / Klarman / Munger scorecard panel that turns the same inputs into a Buy / Watch / Pass verdict using the gate order documented in `.agents/skills/value-investing-masters/SKILL.md`. The sibling `.agents/skills/multibagger-empirics/SKILL.md` captures the empirically validated factor signs (Yartseva 2025) that drive the FCF-yield gate, asset-vs-EBITDA chip, 52-week-range chip, and the rising-rate caution.
- `server/services/stockData.ts` — Tiered data fetch (yfinance → RapidAPI → Alpha Vantage → web scrape → static fallback) with provenance stamping.
- `shared/schema.ts` — Zod + Drizzle schemas. Source of truth for `StockResponse`, `DATA_SOURCES`, etc.
- `tests/*.test.ts` — Vitest suite (calculators, adjustments, research pipeline, storage, schema).

## Data provenance
Every `/api/stock/:symbol` response is stamped with:
- `dataSource` — one of `yfinance | rapidapi | alpha-vantage | web-scrape | fallback | unknown`
- `fetchedAt` — ISO timestamp of when the server returned the payload
- `appliedAdjustments` — list of human-readable notes about derivations (e.g. `EPS derived from price ÷ P/E`).

The UI surfaces these as badges on the search card so the user can judge how trustworthy the headline numbers are.

## Multibagger empirics (Task #30 — Yartseva 2025)
The Value-Investor Verdict ingests three new server-derived signals
shipped in the `multibaggerSignals` block of every `/api/stock/:symbol`
response (yfinance populates them from `ticker.info` + balance-sheet
/ financials; other adapters emit explicit `null`):

- **`fcfYield`** (`free cash flow / market cap`, percent) drives the
  primary cash-quality gate (Option A). `≤ 0` downgrades a base BUY
  to WATCH ("the business is consuming cash, not generating it");
  `> 5%` promotes a borderline WATCH to BUY *only* when MoS is
  adequate, reverse-DCF isn't heroic, quality isn't Speculative, and
  no modifier chips fire — the Graham cushion principle still wins.
  Falls back to `fcfPerShare / price` for adapters without a server
  computation.
- **`assetGrowth` vs. `ebitdaGrowth`** powers the
  *investment-affordability* modifier chip (capital deployed faster
  than earnings can support → flag).
- **`week52High` / `week52Low`** powers the *near-52-week-high*
  momentum chip (price > 80 % of the trailing range → flag). Both
  bounds are converted into the same currency as `price`.

Modifier chips only ever downgrade a base BUY to WATCH; they never
force a Pass and never escalate an existing WATCH/PASS.

## Fed rate environment badge (Task #31)
A small macro-context chip in the calculator header surfaces the
trailing-12-month change in the Fed funds rate, classified as Rising
(≥ +50bp YoY), Stable, or Falling (≤ −50bp YoY). Driven by the public
FRED `FEDFUNDS` CSV endpoint — no API key — with a 24h server-side
in-memory cache. Failures are silent: the badge hides gracefully.

When the environment is Rising **and** the stock is growth-tilted
(low FCF yield < 2%, P/E ≥ 30, or near-52w-high), the Value-Investor
Verdict appends a single italic caution line about long-duration cash
flows getting discounted harder. Strictly informational — never gates
the Buy / Watch / Pass verdict.

- Server: `server/services/fedRate.ts` (fetch + cache + classifier).
- Route: `GET /api/macro/fed-rate` returns `{ environment, currentRate,
  yearAgoRate, deltaBp, asOf, source }` or `{ environment: null }` on
  failure.
- Client: `client/src/components/FedRateBadge.tsx` renders the chip;
  `MarginOfSafetyCalculator.tsx` shares one query with the verdict
  caution helpers (`isGrowthTilted`, `shouldShowFedRateCaution`)
  exported from `ValueInvestorVerdict.tsx`.
- Tests: `tests/fedRate.test.ts` covers the ±50bp classifier
  boundaries, FRED CSV parsing (including `.` sentinels), the
  pick-current-and-year-ago lookup, and every caution-trigger
  combination.

## Multibagger Screener (Task #33)
A descriptive factor-exposure scorecard rendered below the Value-Investor
Verdict on the home page (and as a per-row chip on the Watchlist). Scores any
ticker against the parsimonious factor set documented in
`.agents/skills/multibagger-empirics/SKILL.md` (Yartseva 2025 §6.3) — five
sub-scores (size, value, profitability, investment affordability, 52-week
range entry) each 0–100 plus a weighted composite. The score is **descriptive
of the historical multibagger cohort, not predictive** of any single stock's
forward return.

- **Growth-rate is intentionally excluded** from the score. Yartseva's
  general-to-specific elimination dropped EBITDA/EPS/FCF growth as
  insignificant return predictors in dynamic specifications. The screener
  panel surfaces this caveat inline and links to the empirics skill for the
  rationale.
- Weights mirror the paper's coefficient magnitudes — Value (FCF yield) the
  largest at 35%, then Investment-affordability and 52-week-range at 20%
  each, Size at 15%, Profitability (ROA proxy via ROE) at 10%. Missing
  sub-scores are skipped and the composite is renormalised across whatever
  computed.
- Single-ticker view: `client/src/components/MultibaggerScreener.tsx` —
  renders the breakdown card, score bar per factor, and the
  composite badge ("Strong" ≥65 / "Moderate" 40–65 / "Weak" <40 /
  "Insufficient data").
- Watchlist integration: `client/src/pages/Watchlist.tsx` — adds a "Score"
  column and a "Sort by score" toggle that ranks the list by composite
  descending (entries whose score hasn't computed yet sort to the tail).
- Scoring math: `client/src/lib/multibaggerScreener.ts` — pure functions
  (`scoreTicker`, `compositeBand`, `FACTOR_WEIGHTS`); no React deps so the
  scorer is trivially unit-testable.
- Tests: `tests/multibaggerScreener.test.ts` covers each sub-score's
  boundaries, the missing-data renormalisation path, near-zero-earnings
  edge cases, and the watchlist bulk-scoring + sort path.

`marketCap` is not yet plumbed through `StockData`, so the size sub-score
returns `null` for tickers fetched through the live API; the composite
renormalises across the remaining four factors. Adapters that surface market
cap will light up the size sub-score automatically — no code change needed.

## Valuation hardening (Task #9 / #15)
Recent fixes:
- Removed hard-coded `5year=18.6 / 10year=16.2 / industry=22.5` P/E branches in Task #9. Task #15 restored the three modes — backed by per-ticker `peHistory` (TTM-P/E medians from yfinance) and a published `INDUSTRY_PE_BASELINES` table — never the magic constants. Each mode falls back to current P/E with an explicit note when its data source is missing.
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
- `tests/multibaggerScreener.test.ts` — sub-score boundary tests (FCF yield,
  ROA proxy, investment affordability, 52-week range, size), missing-data
  renormalisation, near-zero-earnings edge cases, and the watchlist
  bulk-scoring + sort path.
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
