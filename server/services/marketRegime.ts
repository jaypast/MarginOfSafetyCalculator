/**
 * Offline market-regime research primitives.
 *
 * This module deliberately has no network or application-state dependencies.
 * The CLI owns data acquisition and reporting; these functions can therefore
 * be tested against small deterministic fixtures without making a production
 * market-regime feature part of the app.
 */

export interface PriceObservation {
  date: string;
  close: number;
}

export interface MarketFeature {
  date: string;
  returnPct: number;
  volatilityPct: number;
}

export interface StandardizedObservation {
  date: string;
  values: number[];
}

export interface HMMConfig {
  stateCount: 2 | 3;
  maxIterations?: number;
  tolerance?: number;
  seed?: number;
}

export interface MarketRegimeState {
  state: number;
  label: string;
  meanReturnPct: number;
  meanVolatilityPct: number;
  probability: number;
}

export interface FittedMarketRegime {
  stateCount: number;
  means: number[][];
  variances: number[][];
  transitions: number[][];
  initial: number[];
  featureMeans: number[];
  featureScales: number[];
  stateOrder: number[];
  states: string[];
  logLikelihood: number;
}

export interface FilteredState {
  date: string;
  probabilities: number[];
  state: number;
  confidence: number;
}

export interface RegimeEvaluation {
  model: "hmm-2" | "hmm-3";
  observations: number;
  forecasts: number;
  accuracy: number;
  averageNextReturnPct: number;
  averageNextVolatilityPct: number;
  stateStability: number;
  transitionFrequency: number;
  averageConfidence: number;
  missingDataCount: number;
  decisionLagMonths: number;
  baseline: boolean;
}

const EPSILON = 1e-8;
const MIN_VARIANCE = 0.04;
const ANNUALIZATION = Math.sqrt(12);

function assertFinite(value: number, context: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${context} must be finite`);
  }
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function variance(values: number[], center = mean(values)): number {
  if (values.length < 2) return MIN_VARIANCE;
  const result =
    values.reduce((total, value) => total + (value - center) ** 2, 0) /
    values.length;
  return Math.max(MIN_VARIANCE, result);
}

function standardDeviation(values: number[]): number {
  return Math.sqrt(variance(values));
}

function logSumExp(values: number[]): number {
  const maximum = Math.max(...values);
  if (!Number.isFinite(maximum)) return -Infinity;
  return maximum + Math.log(values.reduce((sum, value) => sum + Math.exp(value - maximum), 0));
}

function normalize(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= EPSILON) return values.map(() => 1 / values.length);
  return values.map((value) => Math.max(0, value) / total);
}

function seededRandom(seed: number): () => number {
  let value = (seed >>> 0) || 1;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function quantile(values: number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * Convert daily closes into one observation per calendar month.
 *
 * The volatility feature is a trailing three-month standard deviation of
 * monthly returns. It only uses prices known by the observation date.
 */
export function buildMonthlyFeatures(prices: PriceObservation[]): MarketFeature[] {
  const clean = prices
    .filter((point) => point.date && Number.isFinite(point.close) && point.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const monthEnds = new Map<string, PriceObservation>();

  for (const point of clean) {
    monthEnds.set(point.date.slice(0, 7), point);
  }

  const monthly = [...monthEnds.values()].sort((a, b) => a.date.localeCompare(b.date));
  const returns: Array<{ date: string; value: number }> = [];
  for (let index = 1; index < monthly.length; index += 1) {
    returns.push({
      date: monthly[index].date,
      value: Math.log(monthly[index].close / monthly[index - 1].close),
    });
  }

  return returns.map((point, index) => {
    const trailing = returns
      .slice(Math.max(0, index - 2), index + 1)
      .map((item) => item.value);
    return {
      date: point.date,
      returnPct: point.value * 100,
      volatilityPct: standardDeviation(trailing) * 100 * ANNUALIZATION,
    };
  });
}

export function standardizeFeatures(features: MarketFeature[]): {
  observations: StandardizedObservation[];
  means: number[];
  scales: number[];
} {
  if (features.length === 0) {
    return { observations: [], means: [0, 0], scales: [1, 1] };
  }

  const means = [
    mean(features.map((feature) => feature.returnPct)),
    mean(features.map((feature) => feature.volatilityPct)),
  ];
  const scales = [
    Math.max(standardDeviation(features.map((feature) => feature.returnPct)), EPSILON),
    Math.max(standardDeviation(features.map((feature) => feature.volatilityPct)), EPSILON),
  ];

  return {
    observations: features.map((feature) => ({
      date: feature.date,
      values: [
        (feature.returnPct - means[0]) / scales[0],
        (feature.volatilityPct - means[1]) / scales[1],
      ],
    })),
    means,
    scales,
  };
}

function emissionLogProbability(
  observation: number[],
  stateMean: number[],
  stateVariance: number[],
): number {
  return observation.reduce((total, value, dimension) => {
    const varianceValue = Math.max(MIN_VARIANCE, stateVariance[dimension]);
    return total
      - 0.5 * Math.log(2 * Math.PI * varianceValue)
      - ((value - stateMean[dimension]) ** 2) / (2 * varianceValue);
  }, 0);
}

function initializeModel(
  observations: StandardizedObservation[],
  config: Required<HMMConfig>,
): {
  means: number[][];
  variances: number[][];
  transitions: number[][];
  initial: number[];
} {
  const random = seededRandom(config.seed);
  const vectors = observations.map((observation) => observation.values);
  const dimensions = vectors[0]?.length ?? 2;
  const scores = vectors.map((vector) => vector[0] - vector[1] * 0.25);
  const order = [...scores.keys()].sort((a, b) => scores[a] - scores[b]);
  const globalVariance = Array.from({ length: dimensions }, (_, dimension) =>
    variance(vectors.map((vector) => vector[dimension])),
  );

  const means = Array.from({ length: config.stateCount }, (_, state) => {
    const quantileIndex = Math.min(
      order.length - 1,
      Math.floor(((state + 0.5) / config.stateCount) * order.length),
    );
    const selected = vectors[order[Math.max(0, quantileIndex)]] ?? Array(dimensions).fill(0);
    return selected.map((value) => value + (random() - 0.5) * 0.05);
  });
  const variances = means.map(() => [...globalVariance]);
  const selfTransition = config.stateCount === 2 ? 0.88 : 0.84;
  const transitions = Array.from({ length: config.stateCount }, () =>
    Array.from({ length: config.stateCount }, (_, next) =>
      next === 0 ? 0 : (1 - selfTransition) / (config.stateCount - 1),
    ),
  );
  for (let state = 0; state < config.stateCount; state += 1) {
    transitions[state][state] = selfTransition;
  }
  const initial = Array(config.stateCount).fill(1 / config.stateCount);
  return { means, variances, transitions, initial };
}

function forwardBackward(
  observations: number[][],
  means: number[][],
  variances: number[][],
  transitions: number[][],
  initial: number[],
): { alpha: number[][]; beta: number[][]; logLikelihood: number } {
  const length = observations.length;
  const states = means.length;
  const emissions = observations.map((observation) =>
    means.map((stateMean, state) =>
      emissionLogProbability(observation, stateMean, variances[state]),
    ),
  );
  const alpha = Array.from({ length }, () => Array(states).fill(-Infinity));
  for (let state = 0; state < states; state += 1) {
    alpha[0][state] = Math.log(Math.max(initial[state], EPSILON)) + emissions[0][state];
  }
  for (let time = 1; time < length; time += 1) {
    for (let state = 0; state < states; state += 1) {
      alpha[time][state] =
        emissions[time][state] +
        logSumExp(
          alpha[time - 1].map(
            (previous, previousState) =>
              previous + Math.log(Math.max(transitions[previousState][state], EPSILON)),
          ),
        );
    }
  }

  const beta = Array.from({ length }, () => Array(states).fill(0));
  for (let time = length - 2; time >= 0; time -= 1) {
    for (let state = 0; state < states; state += 1) {
      beta[time][state] = logSumExp(
        Array.from({ length: states }, (_, nextState) =>
          Math.log(Math.max(transitions[state][nextState], EPSILON)) +
            emissions[time + 1][nextState] +
            beta[time + 1][nextState],
        ),
      );
    }
  }
  return {
    alpha,
    beta,
    logLikelihood: logSumExp(alpha[length - 1]),
  };
}

export function fitGaussianHMM(
  observations: StandardizedObservation[],
  rawConfig: HMMConfig,
): FittedMarketRegime {
  if (observations.length < rawConfig.stateCount * 4) {
    throw new Error("HMM requires at least four observations per state");
  }
  const config: Required<HMMConfig> = {
    stateCount: rawConfig.stateCount,
    maxIterations: rawConfig.maxIterations ?? 80,
    tolerance: rawConfig.tolerance ?? 1e-4,
    seed: rawConfig.seed ?? 17,
  };
  const initialized = initializeModel(observations, config);
  let { means, variances, transitions, initial } = initialized;
  let previousLikelihood = -Infinity;
  let logLikelihood = -Infinity;

  for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
    const vectors = observations.map((observation) => observation.values);
    const { alpha, beta, logLikelihood: currentLikelihood } = forwardBackward(
      vectors,
      means,
      variances,
      transitions,
      initial,
    );
    logLikelihood = currentLikelihood;

    const gamma = alpha.map((row, time) => {
      const denominator = logSumExp(
        row.map((value, state) => value + beta[time][state]),
      );
      return normalize(row.map((value, state) => Math.exp(value + beta[time][state] - denominator)));
    });

    const nextInitial = [...gamma[0]];
    const nextTransitions = Array.from({ length: config.stateCount }, () =>
      Array(config.stateCount).fill(EPSILON),
    );
    for (let state = 0; state < config.stateCount; state += 1) {
      for (let nextState = 0; nextState < config.stateCount; nextState += 1) {
        let expected = 0;
        for (let time = 0; time < vectors.length - 1; time += 1) {
          const numerator =
            alpha[time][state] +
            Math.log(Math.max(transitions[state][nextState], EPSILON)) +
            emissionLogProbability(vectors[time + 1], means[nextState], variances[nextState]) +
            beta[time + 1][nextState];
          const denominator = logSumExp(
            Array.from({ length: config.stateCount }, (_, previousState) =>
              Array.from({ length: config.stateCount }, (_, followingState) =>
                alpha[time][previousState] +
                  Math.log(Math.max(transitions[previousState][followingState], EPSILON)) +
                  emissionLogProbability(
                    vectors[time + 1],
                    means[followingState],
                    variances[followingState],
                  ) +
                  beta[time + 1][followingState],
              ),
            ).flat(),
          );
          expected += Math.exp(numerator - denominator);
        }
        nextTransitions[state][nextState] = expected;
      }
      nextTransitions[state] = normalize(nextTransitions[state]);
    }

    const nextMeans = means.map((_, state) => {
      const weight = gamma.reduce((total, row) => total + row[state], 0);
      return Array.from({ length: vectors[0].length }, (_, dimension) =>
        gamma.reduce((total, row, time) => total + row[state] * vectors[time][dimension], 0) /
        Math.max(weight, EPSILON),
      );
    });
    const nextVariances = nextMeans.map((stateMean, state) => {
      const weight = gamma.reduce((total, row) => total + row[state], 0);
      return stateMean.map((center, dimension) =>
        Math.max(
          MIN_VARIANCE,
          gamma.reduce(
            (total, row, time) => total + row[state] * (vectors[time][dimension] - center) ** 2,
            0,
          ) / Math.max(weight, EPSILON),
        ),
      );
    });

    initial = normalize(nextInitial);
    transitions = nextTransitions;
    means = nextMeans;
    variances = nextVariances;

    if (
      Number.isFinite(previousLikelihood) &&
      Math.abs(logLikelihood - previousLikelihood) < config.tolerance
    ) {
      break;
    }
    previousLikelihood = logLikelihood;
  }

  const stateOrder = [...Array(config.stateCount).keys()].sort((a, b) => {
    const volatilityDifference = means[a][1] - means[b][1];
    return Math.abs(volatilityDifference) > 0.05
      ? volatilityDifference
      : means[a][0] - means[b][0];
  });
  const states =
    config.stateCount === 2
      ? ["lower-volatility", "higher-volatility"]
      : ["calm", "transition", "stressed"];

  return {
    stateCount: config.stateCount,
    means,
    variances,
    transitions,
    initial,
    featureMeans: [0, 0],
    featureScales: [1, 1],
    stateOrder,
    states,
    logLikelihood,
  };
}

export function attachFeatureScale(
  model: FittedMarketRegime,
  featureMeans: number[],
  featureScales: number[],
): FittedMarketRegime {
  return { ...model, featureMeans: [...featureMeans], featureScales: [...featureScales] };
}

export function filterStateProbabilities(
  model: FittedMarketRegime,
  observations: StandardizedObservation[],
): FilteredState[] {
  if (observations.length === 0) return [];
  const vectors = observations.map((observation) => observation.values);
  const states = model.means.length;
  let probabilities = normalize(
    model.initial.map((initial, state) =>
      initial * Math.exp(emissionLogProbability(vectors[0], model.means[state], model.variances[state])),
    ),
  );
  const output: FilteredState[] = [];
  for (let time = 0; time < vectors.length; time += 1) {
    if (time > 0) {
      const predicted = Array(states).fill(0);
      for (let next = 0; next < states; next += 1) {
        for (let previous = 0; previous < states; previous += 1) {
          predicted[next] += probabilities[previous] * model.transitions[previous][next];
        }
      }
      probabilities = normalize(
        predicted.map((probability, state) =>
          probability * Math.exp(
            emissionLogProbability(vectors[time], model.means[state], model.variances[state]),
          ),
        ),
      );
    }
    const state = probabilities.indexOf(Math.max(...probabilities));
    output.push({
      date: observations[time].date,
      probabilities: [...probabilities],
      state,
      confidence: probabilities[state],
    });
  }
  return output;
}

export function viterbiStates(
  model: FittedMarketRegime,
  observations: StandardizedObservation[],
): number[] {
  if (observations.length === 0) return [];
  const states = model.means.length;
  const vectors = observations.map((observation) => observation.values);
  const scores = Array.from({ length: observations.length }, () => Array(states).fill(-Infinity));
  const previous = Array.from({ length: observations.length }, () => Array(states).fill(0));
  for (let state = 0; state < states; state += 1) {
    scores[0][state] =
      Math.log(Math.max(model.initial[state], EPSILON)) +
      emissionLogProbability(vectors[0], model.means[state], model.variances[state]);
  }
  for (let time = 1; time < observations.length; time += 1) {
    for (let state = 0; state < states; state += 1) {
      const choices = scores[time - 1].map(
        (score, prior) => score + Math.log(Math.max(model.transitions[prior][state], EPSILON)),
      );
      const best = Math.max(...choices);
      scores[time][state] =
        best + emissionLogProbability(vectors[time], model.means[state], model.variances[state]);
      previous[time][state] = choices.indexOf(best);
    }
  }
  const path = Array(observations.length).fill(0);
  path[path.length - 1] = scores[path.length - 1].indexOf(Math.max(...scores[path.length - 1]));
  for (let time = path.length - 1; time > 0; time -= 1) {
    path[time - 1] = previous[time][path[time]];
  }
  return path;
}

export function toRegimeStates(
  model: FittedMarketRegime,
  filtered: FilteredState,
): MarketRegimeState[] {
  return model.stateOrder.map((state, normalizedIndex) => ({
    state,
    label: model.states[normalizedIndex],
    meanReturnPct: model.means[state][0] * model.featureScales[0] + model.featureMeans[0],
    meanVolatilityPct: model.means[state][1] * model.featureScales[1] + model.featureMeans[1],
    probability: filtered.probabilities[state] ?? 0,
  }));
}

export function movingAverageTrend(features: MarketFeature[], index: number): "falling" | "stable" | "rising" {
  const window = features.slice(Math.max(0, index - 2), index + 1);
  const total = window.reduce((sum, feature) => sum + feature.returnPct, 0);
  if (total >= 1) return "rising";
  if (total <= -1) return "falling";
  return "stable";
}

export function volatilityBucket(
  features: MarketFeature[],
  index: number,
  bucketCount: 2 | 3,
): number {
  const historical = features.slice(0, index + 1).map((feature) => feature.volatilityPct);
  const current = features[index]?.volatilityPct ?? 0;
  if (bucketCount === 2) return current >= quantile(historical, 0.5) ? 1 : 0;
  if (current < quantile(historical, 1 / 3)) return 0;
  if (current < quantile(historical, 2 / 3)) return 1;
  return 2;
}

export function classifyHistoricalFedEnvironment(
  rates: Array<{ date: string; value: number }>,
  date: string,
): "rising" | "stable" | "falling" | null {
  const available = rates
    .filter((rate) => rate.date <= date && Number.isFinite(rate.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (available.length < 2) return null;
  const current = available[available.length - 1];
  const targetDate = new Date(`${current.date}T00:00:00Z`);
  targetDate.setUTCFullYear(targetDate.getUTCFullYear() - 1);
  const target = targetDate.toISOString().slice(0, 10);
  let yearAgo = available[0];
  for (const rate of available) {
    if (rate.date <= target) yearAgo = rate;
  }
  const deltaBp = Math.round((current.value - yearAgo.value) * 100);
  if (deltaBp >= 50) return "rising";
  if (deltaBp <= -50) return "falling";
  return "stable";
}

export function parseSimpleCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
  });
}
