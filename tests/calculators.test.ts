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
