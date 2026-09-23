# Tastytrade Market-Data Benchmark

**Decision date:** 2026-09-23  
**Scope:** Determine whether Tastytrade should replace the current data stack for the Margin of Safety calculator.  
**Decision:** **No-go for a wholesale replacement. Conditional go for a credentialed, read-only market-data pilot.**

## Executive result

Tastytrade is a plausible specialist provider for live quotes, historical prices,
streaming, and options metrics. It is not a demonstrated replacement for the
calculator's fundamental inputs. The reviewed documentation does not establish
coverage for EPS history, free cash flow, revenue growth, ROE, leverage, current
ratio, book value, historical P/E, filings, or insider activity.

The calculator's existing code treats a payload as complete only when it has a
positive price and either EPS or FCF/share. Replacing that contract with a
quote-only response would make the application look faster while making its
intrinsic-value result less defensible.

The recommended architecture is therefore:

- Keep the existing fundamentals providers and valuation formulas.
- If a credentialed pilot shows a material improvement, add Tastytrade behind a
  narrow market-data adapter for price/history/optional options context.
- Use the direct REST API or a typed TypeScript SDK, not MCP, in the server's
  deterministic calculation path.
- Preserve source, fetched-at, adjustment notes, cache freshness, and explicit
  missing values.

## What was measured

This was a controlled environment probe, not a production load test. No
Tastytrade account credentials were configured in the workspace, so the probe
did not attempt to access private quotes or invent field-level results. That
limitation is itself material: a real comparison requires a Tastytrade
read-only OAuth setup and exchange/data entitlements.

### Requests from the development environment

| Path | Result | Total time | Interpretation |
|---|---:|---:|---|
| App `/api/stock/AAPL` | HTTP 200, `fmp`, cached/fundamental payload | 0.89 ms | Fast app response; this is not upstream latency because the app cache/database can answer it. |
| App `/api/stock/MSFT` | HTTP 200, `fmp`, cached/fundamental payload | 1.07 ms | Same conclusion. |
| App `/api/stock/BP.L` | HTTP 200 error payload | 11.44 ms | Current path did not produce a usable payload for this international symbol in the probe. |
| Yahoo chart `AAPL` | HTTP 429 | 0.06 s | Public Yahoo chart endpoint was throttled from this environment. |
| Yahoo chart `MSFT` | HTTP 429 | 0.05 s | Same throttling behavior. |
| Yahoo chart `BP.L` | HTTP 429 | 0.04 s | Same throttling behavior. |
| Yahoo chart `0700.HK` | HTTP 429 | 0.04 s | Same throttling behavior. |
| Tastytrade API root, without auth | HTTP 404 | 0.23 ms | Not a market-data request; confirms no public unauthenticated data result was available. |
| Tastytrade developer docs | HTTP 200 | 0.26 ms | Documentation was reachable. |

The Yahoo 429 results demonstrate a current operational weakness, but they do
not prove that Tastytrade is faster. The app's successful AAPL/MSFT responses
were already cache-backed, and no authenticated Tastytrade payload was
available for an apples-to-apples comparison.

## Current application data contract

The application currently has two related data paths:

1. **Stock valuation data:** yfinance, RapidAPI, Alpha Vantage, and FMP are
   started in parallel. The first complete result wins, with a short priority
   grace period. Web scraping, stale cache, and static fallback are used after
   those sources fail.
2. **Historical price chart:** yfinance is tried first, followed by RapidAPI,
   scraping, and static historical data. Successful history is cached for 24
   hours.

Fundamentals are cached for seven days, the 52-week range for one day, and
historical P/E for 30 days. A quick price refresh can recombine a fresh price
with cached fundamentals without pretending the fundamentals were fetched
again.

The `StockResponse` fields are:

| Field group | Required by the calculator | Tastytrade status from reviewed documentation |
|---|---:|---|
| Current price | Yes | **Candidate.** Quote support is documented. Exact field mapping still needs a credentialed probe. |
| Historical OHLC/price series | Chart and historical P/E support | **Candidate.** Historical market data is documented. Corporate-action adjustment and date-range behavior still need verification. |
| 52-week high/low | Multibagger signal and freshness | **Potentially derivable.** Could be calculated from a suitable historical series, but a dedicated equivalent was not confirmed. |
| Market capitalization | Size signal and FCF yield context | **Not confirmed.** Do not infer it from quote data without a documented payload field and currency treatment. |
| EPS | DCF/P/E/Graham | **Not established.** Keep with fundamentals providers. |
| FCF/share | DCF and cash-quality gate | **Not established.** Keep with fundamentals providers. |
| Growth/revenue growth | DCF, Graham, reverse DCF comparison | **Not established.** Keep with fundamentals providers. |
| ROE, debt/equity, current ratio | Company-quality analysis | **Not established.** Keep with fundamentals providers. |
| Historical P/E | 5-year/10-year P/E modes | **No replacement demonstrated.** The app needs quarterly EPS plus price history; price history alone is insufficient. |
| Book value/share | Graham Number | **Not established.** Keep with fundamentals providers. |
| Margins and insider activity | Quality and verdict signals | **Not established.** Keep with existing sources. |
| Options quotes, Greeks, IV rank, liquidity | Optional future market context | **Strength.** Documented by Tastytrade, but not an intrinsic-value input. |

## Direct REST/SDK versus MCP

### Direct REST API or TypeScript SDK: preferred if piloted

This fits the application's adapter model:

- Typed normalization at the provider boundary
- Explicit timeouts and retry policy
- Cache and request deduplication
- Observable source and freshness metadata
- No LLM in the calculation path
- No account or order capability unless deliberately added

The adapter should be market-data-only and should return `null` or an explicit
unsupported-field result for fundamentals it cannot source.

### MCP: not appropriate for the core data path

The official self-hosted MCP server is an agent/tool interface around
Tastytrade capabilities. It can expose quotes, positions, balances, and
dry-run-gated order flows to an LLM. That is useful for interactive research,
but it does not improve the underlying data coverage or make a deterministic
valuation calculation more reliable.

Using MCP here would add an unnecessary process and credential boundary, make
failure tracing harder, and introduce account-data/order-tool risk. If a future
assistant needs options context, MCP should remain an optional research
surface, separate from the calculator's server-side provider adapter.

## Operational constraints

The official documentation identifies several integration costs:

- OAuth access tokens expire after 15 minutes.
- Requests require a `User-Agent` header.
- REST throttling can return HTTP 429 without rate-limit headers; retries need
  exponential backoff and jitter.
- Streaming has credential/session and subscription limits, so the application
  must not create an unbounded connection per browser or worker.
- Sandbox quotes are delayed and sandbox data resets periodically.
- The options backtester is a separate service and is designed for options
  strategy trials, not DCF, Graham, P/E, or margin-of-safety validation.
- The MCP disclosure places responsibility for AI-generated analysis, account
  data, and any order activity on the application owner.

These constraints are manageable for a narrow, read-only adapter but are not
good reasons to replace a functioning fundamentals pipeline.

## SWOT summary

### Strengths

- Documented equity quotes and historical market data.
- Streaming and batch-oriented market-data capabilities.
- Strong options coverage: chains, Greeks, IV rank, and liquidity.
- TypeScript tooling is compatible with this application.

### Weaknesses

- No demonstrated coverage for the calculator's fundamental and filing-derived
  fields.
- Short-lived OAuth access tokens and additional refresh logic.
- 429 responses without simple quota headers.
- Sandbox behavior is not representative of a clean real-time production test.
- Brokerage-oriented capabilities exceed the needs of this product.

### Opportunities

- Faster or more reliable current-price refreshes than the public Yahoo path.
- Better watchlist and bulk quote refreshes through batching or streaming.
- Optional, clearly separated options-market context.
- A future options-research surface using the dedicated backtester.

### Threats

- Faster quotes could create false confidence while fundamentals remain stale or
  incomplete.
- Incorrectly deriving EPS, FCF, or quality fields from market data would damage
  valuation integrity.
- Rate limits, token expiry, entitlement gaps, and session caps could create
  hard-to-reproduce outages.
- MCP would introduce unnecessary LLM, account-data, and order-flow risk.

## Migration gate

No provider change should be made until a credentialed pilot demonstrates all of
the following:

1. Complete quote and history coverage for a representative US equity set,
   including large caps, low-liquidity names, recent IPOs, and symbols with
   exchange suffixes.
2. Measured p50/p95 latency and error rates that are materially better than the
   current path for the same cache state.
3. Correct historical dates, corporate-action treatment, currency handling, and
   52-week range behavior.
4. Predictable handling of 401, token expiry, 429, 5xx, empty payloads, and
   entitlement failures.
5. No regression in EPS, FCF/share, historical P/E, quality, provenance, or
   fail-closed behavior because those fields remain with their existing
   providers.

Until those checks pass, the decision is **no-go for migration** and
**conditional go for a read-only pilot**.

## Sources

- [Tastytrade developer documentation](https://developer.tastytrade.com/docs/)
- [Tastytrade rate limits and backoff](https://developer.tastytrade.com/docs/guides/rate-limits-and-backoff/)
- [Tastytrade backtesting guide](https://developer.tastytrade.com/docs/guides/backtesting/)
- [Tastytrade GitHub organization](https://github.com/tastytrade)
- [Tastytrade MCP server](https://github.com/tastytrade/tastytrade-mcp)
- [Tastytrade TypeScript SDK](https://github.com/tastytrade/tastytrade-api-js)

## Repository evidence

- `server/services/stockData.ts` — parallel source selection, completeness
  gate, cache tiers, provenance, divergence checks, and fallback order.
- `server/services/yahooFinance.ts` — yfinance subprocess timeout and history
  adapter.
- `server/services/webScraper.ts` — Yahoo chart/scraper timeout behavior.
- `server/services/rapidApiFinance.ts` — RapidAPI quote/history normalization.
- `server/services/alphaVantage.ts` — fundamentals and quote normalization.
- `server/services/fmpFinance.ts` — TTM fundamentals, income statements, and
  insider activity.
- `shared/schema.ts` — `StockResponse`, provenance, historical P/E, and
  multibagger signal contracts.
- `client/src/lib/calculators.ts` — DCF, P/E, Graham, reverse-DCF, and
  margin-of-safety dependence on fundamentals.