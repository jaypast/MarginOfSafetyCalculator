import { describe, it, expect } from 'vitest';
import {
  calculateDCF,
  calculateDCFDetailed,
  calculatePE,
  calculatePEDetailed,
  calculateGraham,
  calculateGrahamDetailed,
  calculateBuyBelow,
  calculateDiscountPremium,
  calculateBuyBelowStatus,
  calculateAverageValuation,
  compareDataSources,
} from '@/lib/calculators';
import type { StockData, ValuationParams } from '@/lib/types';

// A reasonable, well-formed stock for the happy-path tests. Apple-shaped
// numbers — high ROE, modest debt, real growth.
function makeStock(overrides: Partial<StockData> = {}): StockData {
  return {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 200,
    eps: 6.5,
    peRatio: 30,
    fcfPerShare: 7,
    growthRate: 10,
    roe: 35,
    debtToEquity: 1.5,
    currentRatio: 1.0,
    revenueGrowth: 8,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    ...overrides,
  };
}

function makeParams(overrides: Partial<ValuationParams> = {}): ValuationParams {
  return {
    dcfGrowthRate: 10,
    dcfDiscountRate: 10,
    dcfTerminalMultiple: 15,
    dcfForecastPeriod: 5,
    peType: 'current',
    peCustomValue: 15,
    peAdjustment: 100,
    grahamGrowthRate: 10,
    grahamBaseValue: 8.5,
    ...overrides,
  };
}

describe('calculateDCF', () => {
  it('produces a finite positive value for a healthy stock', () => {
    const value = calculateDCF(makeStock(), makeParams());
    expect(value).toBeGreaterThan(0);
    expect(Number.isFinite(value)).toBe(true);
  });

  it('returns -1 (N/A) when both EPS and FCF are non-positive', () => {
    const out = calculateDCFDetailed(
      makeStock({ eps: -1, fcfPerShare: -1 }),
      makeParams()
    );
    expect(out.value).toBe(-1);
    expect(out.appliedAdjustments.join(' ')).toMatch(/not applicable/i);
  });

  it('estimates FCF from EPS when FCF data is missing', () => {
    const out = calculateDCFDetailed(
      makeStock({ fcfPerShare: 0 }),
      makeParams()
    );
    expect(out.value).toBeGreaterThan(0);
    expect(out.appliedAdjustments.some(a => /FCF.*EPS/.test(a))).toBe(true);
  });

  it('caps growth rate via industry adjustments', () => {
    const out = calculateDCFDetailed(
      makeStock({ symbol: 'F' /* AUTO_MANUFACTURER, growth cap 15 */ }),
      makeParams({ dcfGrowthRate: 50 })
    );
    expect(out.appliedAdjustments.some(a => /Growth rate.*capped/i.test(a))).toBe(true);
  });

  it('caps intrinsic value at industry priceToCap × current price', () => {
    // Use a generic (DEFAULT-industry) symbol so the test isn't coupled to
    // a per-industry priceToCap. DEFAULT cap is 3.0 → max = 30.
    const out = calculateDCFDetailed(
      makeStock({ symbol: 'XYZQ', name: 'Generic Co', price: 10, eps: 50, fcfPerShare: 50, growthRate: 20 }),
      makeParams({ dcfGrowthRate: 20, dcfTerminalMultiple: 20 })
    );
    expect(out.value).toBeLessThanOrEqual(10 * 3 + 0.01);
    expect(out.appliedAdjustments.some(a => /capped at .* current price/i.test(a))).toBe(true);
  });

  it('does NOT apply Japanese floor by default (regression test)', () => {
    const out = calculateDCFDetailed(
      makeStock({ symbol: '7203.T', price: 100, eps: 0.5, fcfPerShare: 0.5, growthRate: 1 }),
      makeParams({ dcfGrowthRate: 1, dcfTerminalMultiple: 5 })
    );
    // Without the floor the value should be allowed to go below 65% of price
    expect(out.value).toBeLessThan(100 * 0.65);
    expect(out.appliedAdjustments.every(a => !/Japanese floor/i.test(a))).toBe(true);
  });

  it('applies Japanese floor only when applyJapanFloor flag is set', () => {
    const out = calculateDCFDetailed(
      makeStock({ symbol: '7203.T', price: 100, eps: 0.5, fcfPerShare: 0.5, growthRate: 1 }),
      makeParams({ dcfGrowthRate: 1, dcfTerminalMultiple: 5, applyJapanFloor: true })
    );
    expect(out.value).toBeGreaterThanOrEqual(100 * 0.65 - 0.01);
    expect(out.appliedAdjustments.some(a => /Japanese floor/i.test(a))).toBe(true);
  });
});

describe('calculatePE', () => {
  it('uses the company current P/E (not a hard-coded constant)', () => {
    const stock = makeStock({ peRatio: 12, eps: 10, price: 120 });
    const value = calculatePE(stock, makeParams({ peType: 'current' }));
    // 10 EPS × 12 P/E = 120 (within priceToCap of 3 × 120 = 360, so no cap)
    expect(value).toBeCloseTo(120, 1);
  });

  it('does not silently use 18.6 / 16.2 / 22.5 magic constants anymore', () => {
    // The old code had a 5year=18.6 branch. Only `current` and `custom` are
    // valid now — the type system enforces it, and the value should reflect
    // current P/E rather than any magic constant.
    const stock = makeStock({ peRatio: 5, eps: 10, price: 50 });
    const value = calculatePE(stock, makeParams({ peType: 'current' }));
    expect(value).toBeCloseTo(50, 1);
    // It is NOT 10 × 18.6 = 186, nor 10 × 16.2 = 162, nor 10 × 22.5 = 225.
    expect(value).not.toBeCloseTo(186, 0);
    expect(value).not.toBeCloseTo(162, 0);
    expect(value).not.toBeCloseTo(225, 0);
  });

  it('uses custom P/E when peType=custom', () => {
    const value = calculatePE(
      makeStock({ eps: 10, price: 200 }),
      makeParams({ peType: 'custom', peCustomValue: 18 })
    );
    expect(value).toBeCloseTo(180, 1);
  });

  it('returns -1 when EPS is non-positive', () => {
    const out = calculatePEDetailed(
      makeStock({ eps: -2 }),
      makeParams()
    );
    expect(out.value).toBe(-1);
  });

  it('falls back to PEG-style estimate when current PE is missing but growth is known', () => {
    const out = calculatePEDetailed(
      makeStock({ peRatio: 0, growthRate: 15, eps: 5, price: 100 }),
      makeParams({ peType: 'current' })
    );
    expect(out.value).toBeGreaterThan(0);
    expect(out.appliedAdjustments.some(a => /growth-derived PEG/i.test(a))).toBe(true);
  });
});

// ----- Task #15: real per-ticker historical P/E modes -----
describe('calculatePE historical modes', () => {
  it('uses peHistory.fiveYearAvg when peType=5year', () => {
    const stock = makeStock({
      eps: 10,
      price: 200,
      peRatio: 30,
      // industry-cap for DEFAULT-industry stock is 50 (well above 22),
      // so the 22 multiple should pass through uncapped.
      peHistory: { fiveYearAvg: 22, tenYearAvg: 18, industryAvg: 19 },
    });
    const out = calculatePEDetailed(stock, makeParams({ peType: '5year' }));
    expect(out.value).toBeCloseTo(220, 0);
    expect(out.appliedAdjustments.some(a => /5-year median/i.test(a))).toBe(true);
  });

  it('uses peHistory.tenYearAvg when peType=10year', () => {
    const stock = makeStock({
      eps: 10,
      price: 200,
      peRatio: 30,
      peHistory: { fiveYearAvg: 22, tenYearAvg: 18, industryAvg: 19 },
    });
    const out = calculatePEDetailed(stock, makeParams({ peType: '10year' }));
    expect(out.value).toBeCloseTo(180, 0);
    expect(out.appliedAdjustments.some(a => /10-year median/i.test(a))).toBe(true);
  });

  it('5year and 10year produce different values for the same stock when history differs', () => {
    const stock = makeStock({
      eps: 10,
      price: 200,
      peHistory: { fiveYearAvg: 25, tenYearAvg: 17, industryAvg: 19 },
    });
    const fiveYear = calculatePE(stock, makeParams({ peType: '5year' }));
    const tenYear = calculatePE(stock, makeParams({ peType: '10year' }));
    expect(fiveYear).not.toBeCloseTo(tenYear, 0);
    expect(fiveYear).toBeGreaterThan(tenYear);
  });

  it('falls back to current P/E with explicit note when peHistory is missing', () => {
    const stock = makeStock({ eps: 10, price: 200, peRatio: 18 });
    // No peHistory field at all.
    const out = calculatePEDetailed(stock, makeParams({ peType: '5year' }));
    expect(out.value).toBeCloseTo(180, 0);
    expect(out.appliedAdjustments.some(a => /5-year P\/E unavailable/i.test(a))).toBe(true);
  });

  it('falls back to current P/E when peHistory.fiveYearAvg is null (e.g. AMZN-like history)', () => {
    const stock = makeStock({
      eps: 10,
      price: 200,
      peRatio: 18,
      peHistory: { fiveYearAvg: null, tenYearAvg: 25, industryAvg: 24 },
    });
    const out = calculatePEDetailed(stock, makeParams({ peType: '5year' }));
    expect(out.value).toBeCloseTo(180, 0);
    expect(out.appliedAdjustments.some(a => /5-year P\/E unavailable/i.test(a))).toBe(true);
  });

  it('industry mode prefers payload industryAvg over the in-app baseline', () => {
    const stock = makeStock({
      symbol: 'AAPL', // mapped TECHNOLOGY → table baseline 28
      eps: 10,
      price: 200,
      peHistory: { fiveYearAvg: null, tenYearAvg: null, industryAvg: 16 },
    });
    const out = calculatePEDetailed(stock, makeParams({ peType: 'industry' }));
    expect(out.value).toBeCloseTo(160, 0);
    expect(out.appliedAdjustments.some(a => /from data source/i.test(a))).toBe(true);
  });

  it('industry mode falls back to in-app baseline table when no payload value', () => {
    const stock = makeStock({
      symbol: 'JPM', // FINANCIAL → baseline 14
      name: 'JPMorgan Chase',
      eps: 10,
      price: 200,
      peRatio: 12,
    });
    const out = calculatePEDetailed(stock, makeParams({ peType: 'industry' }));
    expect(out.value).toBeCloseTo(140, 0);
    expect(out.appliedAdjustments.some(a => /industry baseline.*FINANCIAL/i.test(a))).toBe(true);
  });

  it('industry mode falls back to current P/E when stock cannot be classified', () => {
    const stock = makeStock({
      symbol: 'XYZQ',
      name: 'Generic Co',
      eps: 10,
      price: 200,
      peRatio: 17,
      // No peHistory field. determineIndustry returns DEFAULT, which DOES
      // have a baseline (19), so verify the DEFAULT path is exercised.
    });
    const out = calculatePEDetailed(stock, makeParams({ peType: 'industry' }));
    // DEFAULT baseline = 19 → 10 × 19 = 190
    expect(out.value).toBeCloseTo(190, 0);
  });

  // Contract test: lock the precedence semantics for industry mode.
  // For ONE AND THE SAME ticker, we run the calculator twice — once
  // with a server-attached `peHistory.industryAvg` and once without —
  // and assert that:
  //   (1) the payload value is the authoritative source (its number
  //       drives the output), and
  //   (2) the local fallback table fires when the payload field is
  //       absent (the output changes to match the table baseline).
  // This lets reviewers see the precedence as a single observable
  // diff rather than inferring it from two unrelated tests.
  it('industry mode contract: payload industryAvg takes precedence over local table for the same ticker', () => {
    // AAPL → TECHNOLOGY in determineIndustry → local baseline 28.
    const base = {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      eps: 10,
      price: 200,
      peRatio: 25,
    };

    // (a) With payload — calculator MUST use 16, not 28.
    const stockWithPayload = makeStock({
      ...base,
      peHistory: { fiveYearAvg: null, tenYearAvg: null, industryAvg: 16 },
    });
    const outPayload = calculatePEDetailed(
      stockWithPayload,
      makeParams({ peType: 'industry' })
    );

    // (b) Without payload — calculator MUST fall back to local table (28).
    const stockNoPayload = makeStock({ ...base });
    const outFallback = calculatePEDetailed(
      stockNoPayload,
      makeParams({ peType: 'industry' })
    );

    // Payload-driven output: 10 × 16 = 160
    expect(outPayload.value).toBeCloseTo(160, 0);
    // Fallback-driven output: 10 × 28 = 280 (clear, observable contrast)
    expect(outFallback.value).toBeCloseTo(280, 0);
    // Outputs MUST differ — proves precedence is a real branch, not a
    // silent merge that quietly averages the two sources together.
    expect(Math.abs(outPayload.value - outFallback.value)).toBeGreaterThan(50);
  });

  it('historical modes still respect the per-industry P/E cap', () => {
    // Use a generic DEFAULT-industry symbol so the test isn't entangled
    // with `specialCases` overrides (which short-circuit industry caps).
    // DEFAULT peMultipleCap = 30, DEFAULT priceToCap = 3.0.
    // A peHistory.fiveYearAvg of 60 should be capped down to 30.
    const stock = makeStock({
      symbol: 'XYZQ',
      name: 'Generic Co',
      eps: 10,
      price: 200,
      peHistory: { fiveYearAvg: 60, tenYearAvg: 28, industryAvg: 12 },
    });
    const out = calculatePEDetailed(stock, makeParams({ peType: '5year' }));
    expect(out.appliedAdjustments.some(a => /capped/i.test(a))).toBe(true);
    // Capped P/E 30 × EPS 10 = 300 (then bound by priceToCap 3.0 × 200 = 600,
    // so 300 stands).
    expect(out.value).toBeCloseTo(300, 0);
  });
});

describe('calculateGraham', () => {
  it('caps growth rate at min(20, industry-cap) per Graham\'s formula', () => {
    const out = calculateGrahamDetailed(
      makeStock({ symbol: 'TM' /* AUTO, cap 15 */, eps: 10, price: 100 }),
      makeParams({ grahamGrowthRate: 30 })
    );
    expect(out.appliedAdjustments.some(a => /Growth rate.*capped/i.test(a) || /Graham 20%/i.test(a))).toBe(true);
  });

  it('returns -1 when EPS is non-positive', () => {
    const out = calculateGrahamDetailed(
      makeStock({ eps: 0 }),
      makeParams()
    );
    expect(out.value).toBe(-1);
  });
});

describe('calculateBuyBelow / discount / status helpers', () => {
  it('applies margin of safety as a percentage discount', () => {
    expect(calculateBuyBelow(100, 25)).toBeCloseTo(75, 2);
    expect(calculateBuyBelow(100, 0)).toBeCloseTo(100, 2);
  });

  it('returns 0.01 sentinel when intrinsic is non-positive', () => {
    expect(calculateBuyBelow(-1, 30)).toBe(0.01);
  });

  it('discount is negative when current < compare', () => {
    expect(calculateDiscountPremium(80, 100)).toBeCloseTo(-20, 1);
  });

  it('buy-below status uses the buy-below price as denominator', () => {
    expect(calculateBuyBelowStatus(80, 100)).toBeCloseTo(-20, 1);
  });
});

describe('calculateAverageValuation', () => {
  it('uses the supplied current price (not reverse-engineered)', () => {
    const results = [
      { method: 'DCF Analysis', intrinsicValue: 120, buyBelow: 90, discountPremium: -16.7 },
      { method: 'P/E Based', intrinsicValue: 100, buyBelow: 75, discountPremium: 0 },
      { method: 'Graham Formula', intrinsicValue: 80, buyBelow: 60, discountPremium: 25 },
    ];
    const avg = calculateAverageValuation(results, 100);
    expect(avg.intrinsicValue).toBeCloseTo(100, 1);
    // 100 vs 100 → 0% discount, computed from real currentPrice
    expect(avg.discountPremium).toBeCloseTo(0, 1);
  });

  it('skips invalid (≤ 0) results when averaging', () => {
    const results = [
      { method: 'DCF', intrinsicValue: 100, buyBelow: 75, discountPremium: 0 },
      { method: 'PE', intrinsicValue: -1, buyBelow: 0.01, discountPremium: 100 },
      { method: 'Graham', intrinsicValue: 200, buyBelow: 150, discountPremium: -50 },
    ];
    const avg = calculateAverageValuation(results, 150);
    expect(avg.intrinsicValue).toBeCloseTo(150, 1);
  });

  it('returns the N/A sentinel when all results are invalid', () => {
    const avg = calculateAverageValuation(
      [{ method: 'DCF', intrinsicValue: -1, buyBelow: 0.01, discountPremium: 100 }],
      100
    );
    expect(avg.intrinsicValue).toBe(-1);
  });
});

describe('compareDataSources', () => {
  it('reports full agreement for identical payloads', () => {
    const data = { price: 100, eps: 5, peRatio: 20, fcfPerShare: 4, growthRate: 10 };
    const result = compareDataSources(data, data);
    expect(result.agreement).toBe(1);
    expect(result.discrepancies).toHaveLength(0);
  });

  it('flags fields outside the tolerance as discrepancies', () => {
    const a = { price: 100, eps: 5, peRatio: 20, fcfPerShare: 4, growthRate: 10 };
    const b = { price: 100, eps: 5, peRatio: 30, fcfPerShare: 4, growthRate: 10 };
    const result = compareDataSources(a, b, 5);
    expect(result.agreement).toBeLessThan(1);
    expect(result.discrepancies.find(d => d.field === 'peRatio')).toBeDefined();
  });

  it('skips zero/missing fields rather than reporting false agreement', () => {
    const a = { price: 100, eps: 0, peRatio: 20, fcfPerShare: 4, growthRate: 10 };
    const b = { price: 100, eps: 0, peRatio: 20, fcfPerShare: 4, growthRate: 10 };
    const result = compareDataSources(a, b);
    expect(result.fieldsCompared).toBe(4);
  });
});
