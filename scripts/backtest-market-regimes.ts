import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  attachFeatureScale,
  buildMonthlyFeatures,
  classifyHistoricalFedEnvironment,
  filterStateProbabilities,
  fitGaussianHMM,
  movingAverageTrend,
  parseSimpleCsv,
  standardizeFeatures,
  volatilityBucket,
  type MarketFeature,
  type PriceObservation,
} from "../server/services/marketRegime";

type FedRatePoint = { date: string; value: number };
type Signal = -1 | 0 | 1;

interface EvaluationResult {
  name: string;
  observations: number;
  forecasts: number;
  coverage: number;
  directionalAccuracy: number | null;
  averageNextReturnPct: number;
  averageNextVolatilityPct: number;
  stateStability: number | null;
  transitionFrequency: number;
  averageConfidence: number | null;
  missingDataCount: number;
  decisionLagMonths: number;
  notes: string;
}

const DEFAULT_REPORT = "docs/market-regime-backtest.md";
const DEFAULT_PRICES = "docs/research/market-regime/spy-5y.csv";
const DEFAULT_FED = "docs/research/market-regime/fedfunds-5y.csv";
const YAHOO_URL = (symbol: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d&events=div%2Csplits`;
const FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU";

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hasArgument(name: string): boolean {
  return process.argv.includes(name);
}

function parsePrices(csv: string): PriceObservation[] {
  return parseSimpleCsv(csv)
    .map((row) => ({
      date: row.date,
      close: Number(row.close ?? row.adjclose),
    }))
    .filter((point) => point.date && Number.isFinite(point.close) && point.close > 0);
}

function parseFedRates(csv: string): FedRatePoint[] {
  return parseSimpleCsv(csv)
    .map((row) => ({
      date: row.date,
      value: Number(row.value ?? row.dfedtaru ?? row.fedfunds),
    }))
    .filter((point) => point.date && Number.isFinite(point.value));
}

function formatPercent(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(digits)}%`;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function percent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function signalDirection(value: number): Signal {
  return value > 0.05 ? 1 : value < -0.05 ? -1 : 0;
}

function scoreSignals(signals: Signal[], nextReturns: number[]): {
  accuracy: number | null;
  coverage: number;
} {
  let correct = 0;
  let usable = 0;
  for (let index = 0; index < signals.length; index += 1) {
    if (signals[index] === 0) continue;
    usable += 1;
    const actual: Signal = nextReturns[index] >= 0 ? 1 : -1;
    if (signals[index] === actual) correct += 1;
  }
  return {
    accuracy: usable ? correct / usable : null,
    coverage: signals.length ? usable / signals.length : 0,
  };
}

function missingMonthCount(features: MarketFeature[]): number {
  let missing = 0;
  for (let index = 1; index < features.length; index += 1) {
    const previous = new Date(`${features[index - 1].date}T00:00:00Z`);
    const current = new Date(`${features[index].date}T00:00:00Z`);
    const monthGap =
      (current.getUTCFullYear() - previous.getUTCFullYear()) * 12 +
      current.getUTCMonth() -
      previous.getUTCMonth();
    if (monthGap > 1) missing += monthGap - 1;
  }
  return missing;
}

function evaluateHmm(
  features: MarketFeature[],
  stateCount: 2 | 3,
  fedRates: FedRatePoint[],
  minTrain = 36,
): EvaluationResult {
  const stateSequence: number[] = [];
  const stableMatches: boolean[] = [];
  const confidence: number[] = [];
  const signals: Signal[] = [];
  const nextReturns: number[] = [];
  const nextVolatility: number[] = [];

  for (let index = minTrain; index < features.length - 1; index += 1) {
    const training = features.slice(0, index + 1);
    const standardized = standardizeFeatures(training);
    const model = attachFeatureScale(
      fitGaussianHMM(standardized.observations, {
        stateCount,
        seed: 17,
        maxIterations: 60,
      }),
      standardized.means,
      standardized.scales,
    );
    const filtered = filterStateProbabilities(model, standardized.observations);
    const current = filtered[filtered.length - 1];
    const normalizedState = model.stateOrder.indexOf(current.state);
    const nearby = attachFeatureScale(
      fitGaussianHMM(standardized.observations, {
        stateCount,
        seed: 1017,
        maxIterations: 60,
      }),
      standardized.means,
      standardized.scales,
    );
    const nearbyCurrent = filterStateProbabilities(nearby, standardized.observations).at(-1);
    const nearbyNormalized = nearbyCurrent
      ? nearby.stateOrder.indexOf(nearbyCurrent.state)
      : normalizedState;
    const expectedReturn =
      model.means[current.state][0] * model.featureScales[0] + model.featureMeans[0];

    stateSequence.push(normalizedState);
    stableMatches.push(normalizedState === nearbyNormalized);
    confidence.push(current.confidence);
    signals.push(signalDirection(expectedReturn));
    nextReturns.push(features[index + 1].returnPct);
    nextVolatility.push(features[index + 1].volatilityPct);

    // The rate environment is deliberately not used to tune the HMM. It is
    // only collected here so the report can show the existing macro baseline.
    void classifyHistoricalFedEnvironment(fedRates, features[index].date);
  }

  const score = scoreSignals(signals, nextReturns);
  return {
    name: `HMM-${stateCount}`,
    observations: features.length,
    forecasts: nextReturns.length,
    coverage: score.coverage,
    directionalAccuracy: score.accuracy,
    averageNextReturnPct: average(nextReturns) ?? 0,
    averageNextVolatilityPct: average(nextVolatility) ?? 0,
    stateStability: percentBoolean(stableMatches),
    transitionFrequency: transitionRate(stateSequence),
    averageConfidence: average(confidence),
    missingDataCount: missingMonthCount(features),
    decisionLagMonths: 1,
    notes:
      "Filtered probabilities are fit on prices available through each month-end. Viterbi is analysis-only.",
  };
}

function evaluateTrend(features: MarketFeature[], minTrain = 36): EvaluationResult {
  const signals: Signal[] = [];
  const nextReturns: number[] = [];
  const nextVolatility: number[] = [];
  for (let index = minTrain; index < features.length - 1; index += 1) {
    const trend = movingAverageTrend(features, index);
    signals.push(trend === "rising" ? 1 : trend === "falling" ? -1 : 0);
    nextReturns.push(features[index + 1].returnPct);
    nextVolatility.push(features[index + 1].volatilityPct);
  }
  const score = scoreSignals(signals, nextReturns);
  return {
    name: "Trend baseline",
    observations: features.length,
    forecasts: nextReturns.length,
    coverage: score.coverage,
    directionalAccuracy: score.accuracy,
    averageNextReturnPct: average(nextReturns) ?? 0,
    averageNextVolatilityPct: average(nextVolatility) ?? 0,
    stateStability: null,
    transitionFrequency: transitionRate(
      signals.map((signal) => (signal === 1 ? 2 : signal === -1 ? 0 : 1)),
    ),
    averageConfidence: null,
    missingDataCount: missingMonthCount(features),
    decisionLagMonths: 1,
    notes: "Three-month return sign; neutral months are not scored as directional calls.",
  };
}

function evaluateVolatility(features: MarketFeature[], bucketCount: 2 | 3, minTrain = 36): EvaluationResult {
  const signals: Signal[] = [];
  const nextReturns: number[] = [];
  const nextVolatility: number[] = [];
  const buckets: number[] = [];
  for (let index = minTrain; index < features.length - 1; index += 1) {
    const bucket = volatilityBucket(features, index, bucketCount);
    const historical = features.slice(minTrain, index + 1);
    const bucketReturns = historical
      .filter((feature, offset) => volatilityBucket(features, minTrain + offset, bucketCount) === bucket)
      .map((_, offset) => features[minTrain + offset + 1]?.returnPct)
      .filter((value): value is number => Number.isFinite(value));
    const expected = average(bucketReturns) ?? 0;
    buckets.push(bucket);
    signals.push(signalDirection(expected));
    nextReturns.push(features[index + 1].returnPct);
    nextVolatility.push(features[index + 1].volatilityPct);
  }
  const score = scoreSignals(signals, nextReturns);
  return {
    name: `Volatility-${bucketCount} bucket baseline`,
    observations: features.length,
    forecasts: nextReturns.length,
    coverage: score.coverage,
    directionalAccuracy: score.accuracy,
    averageNextReturnPct: average(nextReturns) ?? 0,
    averageNextVolatilityPct: average(nextVolatility) ?? 0,
    stateStability: null,
    transitionFrequency: transitionRate(buckets),
    averageConfidence: null,
    missingDataCount: missingMonthCount(features),
    decisionLagMonths: 1,
    notes: `${bucketCount} trailing-volatility buckets with expanding-window conditional returns.`,
  };
}

function evaluateFedBaseline(
  features: MarketFeature[],
  fedRates: FedRatePoint[],
  minTrain = 36,
): EvaluationResult {
  const signals: Signal[] = [];
  const nextReturns: number[] = [];
  const nextVolatility: number[] = [];
  for (let index = minTrain; index < features.length - 1; index += 1) {
    const environment = classifyHistoricalFedEnvironment(fedRates, features[index].date);
    signals.push(environment === "rising" ? -1 : environment === "falling" ? 1 : 0);
    nextReturns.push(features[index + 1].returnPct);
    nextVolatility.push(features[index + 1].volatilityPct);
  }
  const score = scoreSignals(signals, nextReturns);
  return {
    name: "Fed-rate environment baseline",
    observations: features.length,
    forecasts: nextReturns.length,
    coverage: score.coverage,
    directionalAccuracy: score.accuracy,
    averageNextReturnPct: average(nextReturns) ?? 0,
    averageNextVolatilityPct: average(nextVolatility) ?? 0,
    stateStability: null,
    transitionFrequency: transitionRate(
      signals.map((signal) => (signal === 1 ? 2 : signal === -1 ? 0 : 1)),
    ),
    averageConfidence: null,
    missingDataCount: missingMonthCount(features),
    decisionLagMonths: 1,
    notes:
      fedRates.length >= 2
        ? "Uses the existing rising/stable/falling thresholds: +/-50bp over approximately one year."
        : "Unavailable: no historical FRED observations were supplied.",
  };
}

function percentBoolean(values: boolean[]): number | null {
  return values.length ? values.filter(Boolean).length / values.length : null;
}

function transitionRate(states: number[]): number {
  if (states.length < 2) return 0;
  let transitions = 0;
  for (let index = 1; index < states.length; index += 1) {
    if (states[index] !== states[index - 1]) transitions += 1;
  }
  return transitions / (states.length - 1);
}

function resultsTable(results: EvaluationResult[]): string {
  const rows = results.map((result) =>
    `| ${result.name} | ${result.forecasts} | ${percent(result.directionalAccuracy)} | ${formatPercent(result.averageNextReturnPct)} | ${formatPercent(result.averageNextVolatilityPct)} | ${percent(result.stateStability)} | ${percent(result.transitionFrequency)} | ${percent(result.averageConfidence)} | ${result.decisionLagMonths} |`,
  );
  return [
    "| Model | Forecasts | Directional accuracy* | Mean next return | Mean next volatility | State stability | Transition frequency | Confidence | Decision lag |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...rows,
    "",
    "* Directional accuracy excludes neutral signals. This is a diagnostic comparison, not an investment strategy.",
  ].join("\n");
}

function sensitivityTable(features: MarketFeature[], fedRates: FedRatePoint[]): string {
  const rows: string[] = [];
  for (const stateCount of [2, 3] as const) {
    for (const seed of [17, 1017]) {
      const index = features.length - 2;
      const training = features.slice(0, index + 1);
      const standardized = standardizeFeatures(training);
      const model = attachFeatureScale(
        fitGaussianHMM(standardized.observations, { stateCount, seed, maxIterations: 60 }),
        standardized.means,
        standardized.scales,
      );
      const last = filterStateProbabilities(model, standardized.observations).at(-1);
      const environment = classifyHistoricalFedEnvironment(fedRates, features[index].date) ?? "n/a";
      rows.push(
        `| ${stateCount} | ${seed} | ${last ? model.stateOrder.indexOf(last.state) : "n/a"} | ${last ? percent(last.confidence) : "n/a"} | ${environment} |`,
      );
    }
  }
  return [
    "| States | Seed | Latest normalized state | Confidence | Fed environment |",
    "|---:|---:|---:|---:|---|",
    ...rows,
  ].join("\n");
}

async function fetchYahooPrices(symbol: string): Promise<PriceObservation[]> {
  const response = await fetch(YAHOO_URL(symbol), {
    headers: { Accept: "application/json", "User-Agent": "margin-of-safety-research/1.0" },
  });
  if (!response.ok) throw new Error(`Yahoo historical request failed with ${response.status}`);
  const payload = (await response.json()) as {
    chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
  };
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  return timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      close: Number(closes[index]),
    }))
    .filter((point) => Number.isFinite(point.close) && point.close > 0);
}

async function fetchFedRates(): Promise<FedRatePoint[]> {
  const response = await fetch(FRED_URL, { headers: { Accept: "text/csv" } });
  if (!response.ok) throw new Error(`FRED request failed with ${response.status}`);
  return parseFedRates(await response.text());
}

async function loadOrFetch(
  path: string,
  fetcher: () => Promise<unknown>,
  serialize: (value: unknown) => string,
): Promise<string> {
  try {
    return await readFile(resolve(path), "utf8");
  } catch {
    if (!hasArgument("--fetch")) throw new Error(`Missing ${path}; pass --fetch or provide the file`);
    const value = await fetcher();
    const text = serialize(value);
    await mkdir(dirname(resolve(path)), { recursive: true });
    await writeFile(resolve(path), text);
    return text;
  }
}

function serializePrices(points: unknown): string {
  return [
    "date,close",
    ...(points as PriceObservation[]).map((point) => `${point.date},${point.close}`),
    "",
  ].join("\n");
}

function serializeFedRates(points: unknown): string {
  return [
    "date,value",
    ...(points as FedRatePoint[]).map((point) => `${point.date},${point.value}`),
    "",
  ].join("\n");
}

function report(
  symbol: string,
  prices: PriceObservation[],
  features: MarketFeature[],
  fedRates: FedRatePoint[],
  results: EvaluationResult[],
): string {
  const generatedAt = new Date().toISOString();
  const hmmResults = results.filter((result) => result.name.startsWith("HMM"));
  const bestHmm = hmmResults
    .filter((result) => result.directionalAccuracy !== null)
    .sort((a, b) => (b.directionalAccuracy ?? 0) - (a.directionalAccuracy ?? 0))[0];
  const trend = results.find((result) => result.name === "Trend baseline");
  const gate =
    bestHmm &&
    trend &&
    (bestHmm.stateStability ?? 0) >= 0.7 &&
    (bestHmm.directionalAccuracy ?? 0) > (trend.directionalAccuracy ?? 0) + 0.05;
  const recommendation = gate
    ? "CONDITIONAL GO: the experiment clears the preliminary stability and incremental-information checks. A separate product review is still required before exposing a read-only context badge."
    : "NO-GO: this experiment does not establish enough stable, incremental, explainable evidence to add a production market-regime badge.";

  return `# Hidden Market Regime Backtest

Generated: ${generatedAt}

## Recommendation

**${recommendation}**

This is a research result only. It does not change intrinsic value, margin of safety, company quality, watchlist alerts, or recommendation labels.

## Dataset

- Broad-market proxy: **${symbol}**
- Price observations: ${prices.length}
- Monthly observations after feature preparation: ${features.length}
- Date range: ${prices[0]?.date ?? "n/a"} through ${prices.at(-1)?.date ?? "n/a"}
- Historical rate observations: ${fedRates.length}
- Missing calendar months detected: ${missingMonthCount(features)}

The local snapshot is stored beside this report. Re-run with \`npx tsx scripts/backtest-market-regimes.ts --prices ${DEFAULT_PRICES} --fed ${DEFAULT_FED}\` to reproduce the analysis without a network call. Add \`--fetch\` to refresh missing snapshots from the same Yahoo and FRED paths used by the app.

## Method

Monthly log returns and trailing three-month annualized volatility are the only HMM observations. Two-state and three-state diagonal-covariance Gaussian HMMs are fit with Baum-Welch/EM on an expanding window. The random seeds, iteration limit, variance floor, and state-label ordering are fixed in the script.

At each month-end, training uses only prices available through that date. The filtered probability for that date is the live-style output. Viterbi decoding is intentionally not used for the live-style evaluation; it is retrospective and may use later observations.

The diagnostic directional score maps the fitted state's in-sample mean return to a positive/negative next-month call. Neutral baseline calls are excluded from accuracy. This score is a stress test for incremental information, not a trading recommendation.

## Walk-forward results

${resultsTable(results)}

All models have a one-month decision lag because a monthly observation is only complete at month-end and can inform the following month. HMM confidence is the maximum filtered state probability. State stability is agreement between the primary seed and a nearby initialization on the same expanding window.

## Sensitivity

${sensitivityTable(features, fedRates)}

The report compares the HMM with simple moving-average trend, expanding-window volatility buckets, and the existing Fed-rate environment thresholds. The Fed-rate baseline is a macro context comparator, not a causal claim.

## Product gate

- Stable states across nearby initializations: ${gate ? "pass" : "not established"}
- Information beyond the trend baseline: ${gate ? "preliminary pass" : "not established"}
- Explainable live output without hindsight labels: ${gate ? "possible in principle" : "not established"}
- Safe missing-data behavior: **pass in the research tool**; no production endpoint was added

## Scope decision

No production UI, API schema, cache, valuation calculation, or recommendation logic was changed by this experiment. Even if the preliminary numbers look favorable, adding a user-facing context badge should be a separate reviewed change with stale-data handling, source/as-of metadata, and regression coverage.
`;
}

async function main(): Promise<void> {
  const symbol = argument("--symbol", "SPY").toUpperCase();
  const pricesPath = argument("--prices", DEFAULT_PRICES);
  const fedPath = argument("--fed", DEFAULT_FED);
  const reportPath = argument("--report", DEFAULT_REPORT);
  const pricesCsv = await loadOrFetch(pricesPath, () => fetchYahooPrices(symbol), serializePrices);
  const fedCsv = await loadOrFetch(fedPath, fetchFedRates, serializeFedRates);
  const prices = parsePrices(pricesCsv);
  const fedRates = parseFedRates(fedCsv);
  const features = buildMonthlyFeatures(prices);
  if (features.length < 40) throw new Error("Need at least 40 monthly observations for walk-forward evaluation");

  const results = [
    evaluateHmm(features, 2, fedRates),
    evaluateHmm(features, 3, fedRates),
    evaluateTrend(features),
    evaluateVolatility(features, 2),
    evaluateVolatility(features, 3),
    evaluateFedBaseline(features, fedRates),
  ];
  const output = report(symbol, prices, features, fedRates, results);
  await mkdir(dirname(resolve(reportPath)), { recursive: true });
  await writeFile(resolve(reportPath), output);
  console.log(output);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
