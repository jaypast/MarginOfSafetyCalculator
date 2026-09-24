# Hidden Market Regime Backtest

Generated: 2026-09-24T00:25:30.252Z

## Recommendation

**NO-GO: this experiment does not establish enough stable, incremental, explainable evidence to add a production market-regime badge.**

This is a research result only. It does not change intrinsic value, margin of safety, company quality, watchlist alerts, or recommendation labels.


## Dataset

- Broad-market proxy: **SPY**
- Price observations: 7252
- Monthly observations after feature preparation: 345
- Date range: 1996-11-01 through 2025-08-29
- Historical rate observations: 6489
- Missing calendar months detected: 0

Re-run with `npx tsx scripts/backtest-market-regimes.ts --long-cycles`. The committed snapshot combines a scaled **S&P 500 index training-only warm-up** (1996-11 through 1999-12) with SPY closes from 2000 onward; see [dataset provenance](research/market-regime/spy-2000-2025-source.md) for pinned URLs, hashes, and the scaling method. No index warm-up month is scored. The Fed series is the existing local FRED snapshot (begins 2008-12-16); pre-2008 Fed comparison is unavailable. SPY Close adjustment policy is unverified; dividends, constituent changes, and revised data are not modeled. Data ends 2025-08-29 and is not a 2026 market snapshot.

## Method

Monthly log returns and trailing three-month annualized volatility are the only HMM observations. Two-state and three-state diagonal-covariance Gaussian HMMs are fit with Baum-Welch/EM on an expanding window. The random seeds, iteration limit (12 per fit), HMM covariance floor, and state-label ordering are fixed in the script. The raw volatility feature has no covariance floor. The long-cycle iteration limit is lower than the five-year run's 60 to keep repeated expanding-window refits tractable; results are not directly comparable without accounting for convergence.

At each month-end, training uses only prices available through that date. The filtered probability for that date is the live-style output. Viterbi decoding is intentionally not used for the live-style evaluation; it is retrospective and may use later observations.

The diagnostic directional score maps the fitted state's in-sample mean return to a positive/negative next-month call. Neutral baseline calls are excluded from accuracy. This score is a stress test for incremental information, not a trading recommendation.

**Filtered versus retrospective states:** every HMM number in the results table uses month-end **filtered** probabilities. Viterbi is available in the research primitives and covered by tests, but is intentionally excluded from the live-style score because it can use future observations to relabel earlier months.

## Walk-forward results

| Model | Forecasts | Directional accuracy* | Mean next return | Mean next volatility | State stability | Transition frequency | Confidence | Decision lag |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| HMM-2 | 308 | 53.9% | 0.6% | 10.5% | 100.0% | 15.6% | 93.5% | 1 |
| HMM-3 | 308 | 62.2% | 0.6% | 10.5% | 100.0% | 23.1% | 91.0% | 1 |
| Trend baseline | 308 | 58.2% | 0.6% | 10.5% | n/a | 28.3% | n/a | 1 |
| Volatility-2 bucket baseline | 308 | 57.8% | 0.6% | 10.5% | n/a | 23.5% | n/a | 1 |
| Volatility-3 bucket baseline | 308 | 56.1% | 0.6% | 10.5% | n/a | 34.9% | n/a | 1 |
| Fed-rate environment baseline | 308 | 39.5% | 0.6% | 10.5% | n/a | 2.3% | n/a | 1 |

* Directional accuracy excludes neutral signals. This is a diagnostic comparison, not an investment strategy.

## Historical-period walk-forward results

Periods are assigned using the **next month's realized date**; the model at each
month-end uses only the expanding history available at that month-end. Coverage
counts non-neutral calls. Accuracy with few calls is noisy. Seed agreement
compares two initializations and does not prove stable economic interpretation.
The index-derived pre-2000 warm-up provides the 36 months required to make
the first scored SPY forecast for January 2000.

### Dot-com bust (2000-01 to 2002-12)

| Model | Forecast months | Directional coverage | Accuracy on non-neutral calls | Seed agreement |
|---|---:|---:|---:|---:|
| HMM-2 | 36 | 100.0% | 30.6% | 100.0% |
| HMM-3 | 36 | 97.2% | 45.7% | 100.0% |
| Trend baseline | 36 | 86.1% | 38.7% | n/a |
| Volatility-2 bucket baseline | 36 | 94.4% | 52.9% | n/a |
| Volatility-3 bucket baseline | 36 | 91.7% | 42.4% | n/a |
| Fed-rate environment baseline | 36 | 0.0% | n/a | n/a |

### Pre-crisis expansion (2003-01 to 2007-12)

| Model | Forecast months | Directional coverage | Accuracy on non-neutral calls | Seed agreement |
|---|---:|---:|---:|---:|
| HMM-2 | 60 | 100.0% | 66.7% | 100.0% |
| HMM-3 | 60 | 100.0% | 71.7% | 100.0% |
| Trend baseline | 60 | 91.7% | 49.1% | n/a |
| Volatility-2 bucket baseline | 60 | 90.0% | 44.4% | n/a |
| Volatility-3 bucket baseline | 60 | 98.3% | 54.2% | n/a |
| Fed-rate environment baseline | 60 | 0.0% | n/a | n/a |

### Financial crisis (2008-01 to 2009-12)

| Model | Forecast months | Directional coverage | Accuracy on non-neutral calls | Seed agreement |
|---|---:|---:|---:|---:|
| HMM-2 | 24 | 100.0% | 45.8% | 100.0% |
| HMM-3 | 24 | 100.0% | 62.5% | 100.0% |
| Trend baseline | 24 | 100.0% | 66.7% | n/a |
| Volatility-2 bucket baseline | 24 | 100.0% | 33.3% | n/a |
| Volatility-3 bucket baseline | 24 | 100.0% | 41.7% | n/a |
| Fed-rate environment baseline | 24 | 0.0% | n/a | n/a |

### Post-crisis recovery (2010-01 to 2012-12)

| Model | Forecast months | Directional coverage | Accuracy on non-neutral calls | Seed agreement |
|---|---:|---:|---:|---:|
| HMM-2 | 36 | 100.0% | 44.4% | 100.0% |
| HMM-3 | 36 | 100.0% | 47.2% | 100.0% |
| Trend baseline | 36 | 94.4% | 61.8% | n/a |
| Volatility-2 bucket baseline | 36 | 88.9% | 46.9% | n/a |
| Volatility-3 bucket baseline | 36 | 97.2% | 37.1% | n/a |
| Fed-rate environment baseline | 36 | 0.0% | n/a | n/a |

### Long low-volatility expansion (2013-01 to 2017-12)

| Model | Forecast months | Directional coverage | Accuracy on non-neutral calls | Seed agreement |
|---|---:|---:|---:|---:|
| HMM-2 | 60 | 100.0% | 73.3% | 100.0% |
| HMM-3 | 60 | 100.0% | 76.7% | 100.0% |
| Trend baseline | 60 | 88.3% | 71.7% | n/a |
| Volatility-2 bucket baseline | 60 | 100.0% | 75.0% | n/a |
| Volatility-3 bucket baseline | 60 | 96.7% | 75.9% | n/a |
| Fed-rate environment baseline | 60 | 15.0% | 0.0% | n/a |

### Late-cycle turbulence (2018-01 to 2019-12)

| Model | Forecast months | Directional coverage | Accuracy on non-neutral calls | Seed agreement |
|---|---:|---:|---:|---:|
| HMM-2 | 24 | 100.0% | 50.0% | 100.0% |
| HMM-3 | 24 | 100.0% | 70.8% | 100.0% |
| Trend baseline | 24 | 87.5% | 57.1% | n/a |
| Volatility-2 bucket baseline | 24 | 100.0% | 75.0% | n/a |
| Volatility-3 bucket baseline | 24 | 87.5% | 57.1% | n/a |
| Fed-rate environment baseline | 24 | 91.7% | 36.4% | n/a |

### 2020 shock and recovery (2020-01 to 2021-12)

| Model | Forecast months | Directional coverage | Accuracy on non-neutral calls | Seed agreement |
|---|---:|---:|---:|---:|
| HMM-2 | 24 | 100.0% | 45.8% | 100.0% |
| HMM-3 | 24 | 100.0% | 54.2% | 100.0% |
| Trend baseline | 24 | 91.7% | 59.1% | n/a |
| Volatility-2 bucket baseline | 24 | 100.0% | 66.7% | n/a |
| Volatility-3 bucket baseline | 24 | 91.7% | 63.6% | n/a |
| Fed-rate environment baseline | 24 | 62.5% | 60.0% | n/a |

### Inflation and recent period (2022-01 to 2025-08)

| Model | Forecast months | Directional coverage | Accuracy on non-neutral calls | Seed agreement |
|---|---:|---:|---:|---:|
| HMM-2 | 44 | 100.0% | 47.7% | 100.0% |
| HMM-3 | 44 | 100.0% | 54.5% | 100.0% |
| Trend baseline | 44 | 95.5% | 59.5% | n/a |
| Volatility-2 bucket baseline | 44 | 100.0% | 61.4% | n/a |
| Volatility-3 bucket baseline | 44 | 100.0% | 61.4% | n/a |
| Fed-rate environment baseline | 44 | 79.5% | 42.9% | n/a |

The period labels are descriptive and chosen in advance; they are not HMM
states. A production gate requires the **same fixed state count** to beat trend
by more than five percentage points in every period, with at least 50% coverage
and 70% seed agreement in each. This gate fails; the no-go decision remains.

HMM-3 beats trend in the dot-com and pre-crisis expansion segments, but trails
trend in the 2008–2009 crisis, 2020 shock, and 2022–2025. Its 2013–2017
advantage over trend is small relative to the simpler volatility baselines.
Seed agreement measures repeatability of state IDs, not whether those states
add actionable information beyond simple volatility.


All models have a one-month decision lag because a monthly observation is only complete at month-end and can inform the following month. HMM confidence is the maximum filtered state probability. State stability is agreement between the primary seed and a nearby initialization on the same expanding window.

## Sensitivity

| States | Seed | Latest normalized state | Confidence | Fed environment |
|---:|---:|---:|---:|---|
| 2 | 17 | 0 | 95.7% | falling |
| 2 | 1017 | 0 | 95.7% | falling |
| 3 | 17 | 0 | 57.5% | falling |
| 3 | 1017 | 0 | 57.4% | falling |

### Start-date sensitivity

The long-cycle run uses a fixed 1996–1999 training warm-up and first scores January 2000; the period slices above retain the expanding full-history training window. Re-fitting each period from scratch would use different training information and would not be a walk-forward period comparison.

The report compares the HMM with simple moving-average trend, expanding-window volatility buckets, and the existing Fed-rate environment thresholds. The Fed-rate baseline is a macro context comparator, not a causal claim.

HMM-3 directional accuracy was 62.2%, compared with 58.2% for the trend baseline.

## Product gate

- Stable states across nearby initializations: pass for the two tested seeds; economic interpretation not established
- Information beyond the trend baseline: not established
- Explainable live output without hindsight labels: not established
- Safe missing-data behavior: **pass in the research tool**; no production endpoint was added

## Scope decision

No production UI, API schema, cache, valuation calculation, or recommendation logic was changed by this experiment. Even if the preliminary numbers look favorable, adding a user-facing context badge should be a separate reviewed change with stale-data handling, source/as-of metadata, and regression coverage.
