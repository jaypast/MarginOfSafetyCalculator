# Decision Funnel Analytics Design

## Goal

Measure the core stock-analysis funnel with Replit-hosted Umami custom events:

1. A visitor submits a stock search.
2. The app completes or fails the stock lookup.
3. The visitor calculates and reviews valuation results.
4. The visitor changes valuation method.
5. The visitor adds or removes a stock from the watchlist.
6. The visitor exports a printable valuation report.

The events must explain funnel outcomes without collecting ticker symbols, prices,
account data, or free-form user content.

## Event contract

| Event | Properties |
| --- | --- |
| `stock_search_submitted` | `location` |
| `stock_search_completed` | `outcome`, `source`, `location` |
| `valuation_completed` | `method`, `outcome`, `location` |
| `valuation_method_changed` | `method`, `location` |
| `watchlist_changed` | `action`, `location`, optional `method` and `outcome` |
| `report_generated` | `method`, `outcome`, `format`, `location` |

Property values are primitive strings, numbers, or booleans. Event names use
snake_case. The existing shared analytics wrapper remains the only call site
for `window.umami.track`, and all calls remain safe no-ops when the tracker is
not injected.

## Privacy and behavior

- Do not send symbols, names, prices, valuation values, user-entered assumptions,
  session identifiers, or free-form text.
- Track successful outcomes only after the corresponding operation completes.
- Track failed stock lookups with a coarse `outcome` value so the funnel can
  distinguish demand from provider failures.
- Do not add an analytics script, website ID, environment variable, or server
  endpoint; Replit injects the tracker on published websites.
- Existing event names remain stable. Existing event properties that contain
  ticker symbols are removed.

## Implementation boundaries

- `client/src/lib/analytics.ts` owns the safe Umami wrapper and its event types.
- `client/src/hooks/useStockData.ts` or the stock-information boundary emits
  search completion events.
- `client/src/components/MarginOfSafetyCalculator.tsx` emits valuation outcome
  events after calculations complete.
- `client/src/components/ValuationResults.tsx` emits report export events.
- Existing watchlist and method-selection events are normalized to this contract.

## Verification

- Add focused tests for event payload privacy and success/failure behavior where
  practical.
- Run TypeScript, the full Vitest suite, and the production build.
- Confirm the development app still works when `window.umami` is absent.

## Findings and product decisions

The 30-day analytics baseline queried on September 12, 2026 contained no custom
events for these funnel stages. Conversion rates cannot be calculated until
analytics is enabled and this instrumentation is published. The first useful
review should compare distinct sessions at each stage rather than raw event
counts, because visitors can search or recalculate more than once.

- If successful stock loads frequently stop before `valuation_completed`, make
  the valuation result panel open by default for first-time searches or move the
  primary result above the collapsed evidence panels.
- If undervalued results convert to watchlist additions but fairly valued and
  overvalued results rarely do, change the terminal action copy by outcome (for
  example, “Watch for a better price” instead of a generic save action).