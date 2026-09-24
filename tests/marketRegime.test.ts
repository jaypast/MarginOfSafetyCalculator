import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertCycleCoverage, CYCLE_PERIODS } from "../scripts/market-regime-periods";
import {
  buildMonthlyFeatures,
  classifyHistoricalFedEnvironment,
  filterStateProbabilities,
  fitGaussianHMM,
  parseSimpleCsv,
  standardizeFeatures,
  viterbiStates,
} from "../server/services/marketRegime";

function fixturePrices(): Array<{ date: string; close: number }> {
  const prices: Array<{ date: string; close: number }> = [];
  let close = 100;
  for (let month = 0; month < 36; month += 1) {
    const year = 2020 + Math.floor(month / 12);
    const monthNumber = (month % 12) + 1;
    close *= month % 6 < 3 ? 1.03 : 0.96;
    prices.push({
      date: `${year}-${String(monthNumber).padStart(2, "0")}-28`,
      close,
    });
  }
  return prices;
}

describe("market regime research primitives", () => {
  it("scores every cycle from the first dot-com month through the last SPY month", () => {
    const csv = readFileSync("docs/research/market-regime/spy-2000-2025.csv", "utf8");
    const prices = parseSimpleCsv(csv).map((row) => ({ date: row.date, close: Number(row.close) }));
    const features = buildMonthlyFeatures(prices);
    // The script trains through feature index 36, then scores index 37 onward.
    const scored = features.slice(37).map((feature) => feature.date);
    expect(scored[0]).toMatch(/^2000-01-/);
    expect(scored.at(-1)).toBe("2025-08-29");
    expect(CYCLE_PERIODS[0].label).toBe("Dot-com bust");
    expect(() => assertCycleCoverage(scored)).not.toThrow();
    expect(() => assertCycleCoverage(scored.slice(1))).toThrow(/without gaps/);
    expect(() => assertCycleCoverage(scored.filter((date) => !date.startsWith("2008-10")))).toThrow(/without gaps/);
  });

  it("keeps raw trailing volatility separate from the HMM covariance floor", () => {
    const prices = [100, 101, 100, 104, 101].map((close, index) => ({
      date: `2020-0${index + 1}-28`,
      close,
    }));
    const features = buildMonthlyFeatures(prices);
    expect(features[0].volatilityPct).toBe(0);
    const first = Math.log(101 / 100);
    const second = Math.log(100 / 101);
    const center = (first + second) / 2;
    const expected = Math.sqrt(((first - center) ** 2 + (second - center) ** 2) / 2) * 100 * Math.sqrt(12);
    expect(features[1].volatilityPct).toBeCloseTo(expected, 8);
    expect(features[2].volatilityPct).not.toBeCloseTo(features[1].volatilityPct);
  });

  it("keeps one month-end per month and derives trailing features", () => {
    const features = buildMonthlyFeatures([
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-31", close: 101 },
      { date: "2024-02-01", close: 101 },
      { date: "2024-02-29", close: 99 },
      { date: "2024-03-29", close: 102 },
    ]);
    expect(features).toHaveLength(2);
    expect(features[0].date).toBe("2024-02-29");
    expect(Number.isFinite(features[0].volatilityPct)).toBe(true);
    expect(features[1].returnPct).toBeGreaterThan(0);
  });

  it("fits deterministically and keeps filtered probabilities normalized", () => {
    const features = buildMonthlyFeatures(fixturePrices());
    const standardized = standardizeFeatures(features);
    const first = fitGaussianHMM(standardized.observations, {
      stateCount: 2,
      seed: 17,
    });
    const second = fitGaussianHMM(standardized.observations, {
      stateCount: 2,
      seed: 17,
    });
    expect(first.means).toEqual(second.means);
    const filtered = filterStateProbabilities(first, standardized.observations);
    expect(filtered).toHaveLength(features.length);
    for (const point of filtered) {
      expect(point.probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);
      expect(point.confidence).toBeGreaterThanOrEqual(0.5);
    }
    expect(viterbiStates(first, standardized.observations)).toHaveLength(features.length);
  });

  it("supports three states and rejects too-short training windows", () => {
    const features = buildMonthlyFeatures(fixturePrices());
    const standardized = standardizeFeatures(features);
    const model = fitGaussianHMM(standardized.observations, {
      stateCount: 3,
      seed: 17,
    });
    expect(model.stateOrder).toHaveLength(3);
    expect(() =>
      fitGaussianHMM(standardized.observations.slice(0, 10), {
        stateCount: 3,
      }),
    ).toThrow("at least four observations per state");
  });

  it("uses only rates available by the as-of date", () => {
    const rates = [
      { date: "2023-01-01", value: 4 },
      { date: "2024-01-01", value: 5 },
      { date: "2025-01-01", value: 3 },
    ];
    expect(classifyHistoricalFedEnvironment(rates, "2024-06-01")).toBe("rising");
    expect(classifyHistoricalFedEnvironment(rates, "2025-06-01")).toBe("falling");
    expect(classifyHistoricalFedEnvironment(rates, "2022-06-01")).toBeNull();
  });

  it("parses local CSV snapshots without accepting invalid prices", () => {
    expect(parseSimpleCsv("date,close\n2024-01-01,100\n2024-02-01,101")).toEqual([
      { date: "2024-01-01", close: "100" },
      { date: "2024-02-01", close: "101" },
    ]);
  });
});