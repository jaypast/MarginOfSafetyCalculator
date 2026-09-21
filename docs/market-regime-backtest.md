# Hidden Market Regime Backtest

Generated: 2026-09-21T14:59:16.167Z

## Recommendation

**NO-GO: this experiment does not establish enough stable, incremental, explainable evidence to add a production market-regime badge.**

This is a research result only. It does not change intrinsic value, margin of safety, company quality, watchlist alerts, or recommendation labels.

## Dataset

- Broad-market proxy: **SPY**
- Price observations: 1255
- Monthly observations after feature preparation: 60
- Date range: 2021-09-21 through 2026-09-21
- Historical rate observations: 6489
- Missing calendar months detected: 0

The local snapshot is stored beside this report. Re-run with `npx tsx scripts/backtest-market-regimes.ts --prices docs/research/market-regime/spy-5y.csv --fed docs/research/market-regime/fedfunds-5y.csv` to reproduce the analysis without a network call. Add `--fetch` to refresh missing snapshots from the same Yahoo and FRED paths used by the app.

## Method

Monthly log returns and trailing three-month annualized volatility are the only HMM observations. Two-state and three-state diagonal-covariance Gaussian HMMs are fit with Baum-Welch/EM on an expanding window. The random seeds, iteration limit, variance floor, and state-label ordering are fixed in the script.

At each month-end, training uses only prices available through that date. The filtered probability for that date is the live-style output. Viterbi decoding is intentionally not used for the live-style evaluation; it is retrospective and may use later observations.

The diagnostic directional score maps the fitted state's in-sample mean return to a positive/negative next-month call. Neutral baseline calls are excluded from accuracy. This score is a stress test for incremental information, not a trading recommendation.

**Filtered versus retrospective states:** every HMM number in the results table uses month-end **filtered** probabilities. Viterbi is available in the research primitives and covered by tests, but is intentionally excluded from the live-style score because it can use future observations to relabel earlier months.

## Walk-forward results

| Model | Forecasts | Directional accuracy* | Mean next return | Mean next volatility | State stability | Transition frequency | Confidence | Decision lag |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| HMM-2 | 23 | 60.9% | 1.3% | 69.3% | 100.0% | 36.4% | 85.8% | 1 |
| HMM-3 | 23 | 65.2% | 1.3% | 69.3% | 100.0% | 0.0% | 100.0% | 1 |
| Trend baseline | 23 | 66.7% | 1.3% | 69.3% | n/a | 27.3% | n/a | 1 |
| Volatility-2 bucket baseline | 23 | 73.9% | 1.3% | 69.3% | n/a | 0.0% | n/a | 1 |
| Volatility-3 bucket baseline | 23 | 73.9% | 1.3% | 69.3% | n/a | 0.0% | n/a | 1 |
| Fed-rate environment baseline | 23 | 65.2% | 1.3% | 69.3% | n/a | 0.0% | n/a | 1 |

* Directional accuracy excludes neutral signals. This is a diagnostic comparison, not an investment strategy.

All models have a one-month decision lag because a monthly observation is only complete at month-end and can inform the following month. HMM confidence is the maximum filtered state probability. State stability is agreement between the primary seed and a nearby initialization on the same expanding window.

## Sensitivity

| States | Seed | Latest normalized state | Confidence | Fed environment |
|---:|---:|---:|---:|---|
| 2 | 17 | 1 | 100.0% | falling |
| 2 | 1017 | 1 | 100.0% | falling |
| 3 | 17 | 1 | 100.0% | falling |
| 3 | 1017 | 1 | 100.0% | falling |

### Start-date sensitivity

| Analysis starts | Model | Forecasts | Directional accuracy | State stability | Transition frequency |
|---|---|---:|---:|---:|---:|
| 2021-10-29 | HMM-2 | 23 | 60.9% | 100.0% | 36.4% |
| 2021-10-29 | HMM-3 | 23 | 65.2% | 100.0% | 0.0% |
| 2022-04-29 | HMM-2 | 17 | 76.5% | 100.0% | 0.0% |
| 2022-04-29 | HMM-3 | 17 | 76.5% | 94.1% | 0.0% |
| 2022-10-31 | HMM-2 | 11 | 72.7% | 100.0% | 10.0% |
| 2022-10-31 | HMM-3 | 11 | 63.6% | 100.0% | 50.0% |

The report compares the HMM with simple moving-average trend, expanding-window volatility buckets, and the existing Fed-rate environment thresholds. The Fed-rate baseline is a macro context comparator, not a causal claim.

HMM-3 directional accuracy was 65.2%, compared with 66.7% for the trend baseline.

## Product gate

- Stable states across nearby initializations: not established
- Information beyond the trend baseline: not established
- Explainable live output without hindsight labels: not established
- Safe missing-data behavior: **pass in the research tool**; no production endpoint was added

## Scope decision

No production UI, API schema, cache, valuation calculation, or recommendation logic was changed by this experiment. Even if the preliminary numbers look favorable, adding a user-facing context badge should be a separate reviewed change with stale-data handling, source/as-of metadata, and regression coverage.
