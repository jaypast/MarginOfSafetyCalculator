import { describe, it, expect } from 'vitest';
import { calculateDCF, calculatePE, calculateGraham, calculateBuyBelow } from '@/lib/calculators';
import type { StockData, ValuationParams } from '@/lib/types';

// =============================================================================
// Golden-value regression tests
//
// These lock in the *exact* intrinsic values produced by the current
// calculator implementation for a hand-picked, representative cross-section
// of companies. Any change to the math that shifts a number by more than
// $0.01 will break these tests — which is the point. The numbers below were
// derived by stepping through the calculator formulas with the inputs
// listed and round-tripping through `parseFloat(value.toFixed(2))` exactly
// as `calculateDCF*` does. They are *not* tweaked to match an arbitrary
// future revision; they are the truth-table for today's behaviour.
//
// Coverage:
//   • AAPL  — Technology (high growth, high cap)
//   • JPM   — Financial (lower growth, lower caps, fcfToEps=0.6 path)
//   • F     — Auto manufacturer (cyclical caps)
//   • 7203.T — Toyota (special-case overrides + Japan market cap)
//   • Loss-maker — negative EPS / FCF (must return -1 sentinels)
// =============================================================================

const DEFAULT_PARAMS: ValuationParams = {
  dcfGrowthRate: 10,
  dcfDiscountRate: 10,
  dcfTerminalMultiple: 15,
  dcfForecastPeriod: 10,
  peType: 'current',
  peCustomValue: 15,
  peAdjustment: 100,
  grahamGrowthRate: 10,
  grahamBaseValue: 15,
};

function p(overrides: Partial<ValuationParams> = {}): ValuationParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}

describe('AAPL (Technology) — golden values', () => {
  const aapl: StockData = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 170,
    eps: 6,
    peRatio: 28,
    fcfPerShare: 6,
    growthRate: 10,
    roe: 30,
    debtToEquity: 1.5,
    currentRatio: 1.0,
    revenueGrowth: 8,
    earningsStability: 'High',
    competitivePosition: 'Strong',
  };

  it('DCF intrinsic value matches golden (10% growth, 10% discount, 15× terminal)', () => {
    // TECHNOLOGY priceToCap = 4.0 → upper bound = 680. The forecast sum
    // produces a value well below that cap. Hand-derived golden number is
    // captured to 2-decimal precision and locked in.
    const v = calculateDCF(aapl, p());
    expect(v).toBeCloseTo(134.16, 2);
  });

  it('P/E intrinsic value matches golden (uses current P/E of 28)', () => {
    // 6 EPS × 28 P/E (under TECHNOLOGY peMultipleCap=40) = 168.
    const v = calculatePE(aapl, p());
    expect(v).toBeCloseTo(168, 2);
  });

  it('Graham intrinsic value matches golden (15 + 2×10 = 35× EPS)', () => {
    // Implied P/E = 35, capped by TECHNOLOGY peMultipleCap = 40 → no cap fires.
    // 6 × 35 = 210.
    const v = calculateGraham(aapl, p());
    expect(v).toBeCloseTo(210, 2);
  });

  it('25% margin-of-safety buy-below for the P/E value is 168 × 0.75', () => {
    expect(calculateBuyBelow(168, 25)).toBeCloseTo(126, 2);
  });
});

describe('JPM (Financial) — golden values', () => {
  const jpm: StockData = {
    symbol: 'JPM',
    name: 'JPMorgan Chase',
    price: 160,
    eps: 15,
    peRatio: 11,
    fcfPerShare: 12,
    growthRate: 6,
    roe: 14,
    debtToEquity: 1.2,
    currentRatio: 1.1,
    revenueGrowth: 5,
    earningsStability: 'High',
    competitivePosition: 'Strong',
  };

  it('DCF respects the FINANCIAL caps (terminal=12, growth≤12)', () => {
    // dcfGrowthRate=10 ≤ growthRateCap=12 → no growth cap.
    // Terminal multiple 15 → 12 (FINANCIAL cap).
    // Hits the 2.0× priceToCap ceiling = 160 × 2.0 = 320 → fully bound.
    // Then the implied P/FCF cap collapses it back further; locked-in value:
    const v = calculateDCF(jpm, p());
    expect(v).toBeCloseTo(180, 2);
  });

  it('P/E uses the current ratio of 11 (under FINANCIAL peMultipleCap of 20)', () => {
    // 15 × 11 = 165, well under 320 priceToCap ceiling.
    const v = calculatePE(jpm, p());
    expect(v).toBeCloseTo(165, 2);
  });

  it('Graham implied P/E is capped at 20 (FINANCIAL peMultipleCap)', () => {
    // Raw Graham = 15 × (15 + 2×10) = 525, implied P/E = 35 > cap 20.
    // Capped value = 15 × 20 = 300, but priceToCap (2.0) caps at 320 → 300 wins.
    const v = calculateGraham(jpm, p());
    expect(v).toBeCloseTo(300, 2);
  });
});

describe('F (Ford / Auto Manufacturer) — golden values', () => {
  const ford: StockData = {
    symbol: 'F',
    name: 'Ford Motor Company',
    price: 12,
    eps: 1.2,
    peRatio: 10,
    fcfPerShare: 1.0,
    growthRate: 4,
    roe: 11,
    debtToEquity: 3.0,
    currentRatio: 1.2,
    revenueGrowth: 3,
    earningsStability: 'Medium',
    competitivePosition: 'Average',
  };

  it('DCF caps growth at AUTO_MANUFACTURER ceiling (15%) and value at 2.5× price', () => {
    // dcfGrowthRate=10 ≤ growthRateCap=15 → no growth cap fires.
    // Terminal multiple 15 → 12 (AUTO cap).
    // priceToCap = 2.5 → upper bound = 30. Locked-in golden:
    const v = calculateDCF(ford, p());
    expect(v).toBeCloseTo(19.76, 2);
  });

  it('P/E intrinsic = 1.2 × 10 = 12', () => {
    const v = calculatePE(ford, p());
    expect(v).toBeCloseTo(12, 2);
  });

  it('Graham: implied P/E (35) capped at 25 → 1.2 × 25 = 30 (also = priceToCap)', () => {
    const v = calculateGraham(ford, p());
    expect(v).toBeCloseTo(30, 2);
  });
});

describe('7203.T (Toyota) — golden values with special-case + Japan caps', () => {
  // 7203.T sits in `specialCases` so it bypasses industry mapping. Its
  // override gives priceToCap=2.0 and terminalMultipleCap=12, and the
  // generic Japan handler would *also* apply a 2.5× cap — the special-case
  // value is stricter, so 2.0 wins.
  const toyota: StockData = {
    symbol: '7203.T',
    name: 'Toyota Motor Corporation',
    price: 2500,
    eps: 200,
    peRatio: 12.5,
    fcfPerShare: 180,
    growthRate: 5,
    roe: 11,
    debtToEquity: 1.0,
    currentRatio: 1.1,
    revenueGrowth: 4,
    earningsStability: 'High',
    competitivePosition: 'Strong',
  };

  it('DCF respects the special-case 2.0× priceToCap = 5000 ceiling', () => {
    const v = calculateDCF(toyota, p());
    expect(v).toBeLessThanOrEqual(2500 * 2.0 + 0.01);
    expect(v).toBeCloseTo(3556.59, 2);
  });

  it('does NOT apply the Japanese floor by default — value can be below price', () => {
    // Use a stressed scenario (negative growth would normally be floored)
    const stressed: StockData = { ...toyota, growthRate: 1, fcfPerShare: 50, eps: 50 };
    const v = calculateDCF(stressed, p({ dcfGrowthRate: 1 }));
    // No floor → value is allowed to be well below the current price of 2500.
    expect(v).toBeLessThan(2500);
  });

  it('Japanese floor opt-in raises the value to 65% of current price', () => {
    const stressed: StockData = { ...toyota, growthRate: 1, fcfPerShare: 50, eps: 50 };
    const v = calculateDCF(stressed, p({ dcfGrowthRate: 1, applyJapanFloor: true }));
    expect(v).toBeGreaterThanOrEqual(2500 * 0.65 - 0.01);
  });
});

describe('Loss-making company — golden values (sentinel returns)', () => {
  const loss: StockData = {
    symbol: 'LOSS',
    name: 'Loss Maker Inc.',
    price: 20,
    eps: -2,
    peRatio: 0,
    fcfPerShare: -1,
    growthRate: 0,
    roe: -5,
    debtToEquity: 4.0,
    currentRatio: 0.7,
    revenueGrowth: -3,
    earningsStability: 'Low',
    competitivePosition: 'Weak',
  };

  it('DCF returns the -1 sentinel when both EPS and FCF are negative', () => {
    expect(calculateDCF(loss, p())).toBe(-1);
  });

  it('P/E returns the -1 sentinel when EPS ≤ 0', () => {
    expect(calculatePE(loss, p())).toBe(-1);
  });

  it('Graham returns the -1 sentinel when EPS ≤ 0', () => {
    expect(calculateGraham(loss, p())).toBe(-1);
  });

  it('buyBelow returns the 0.01 floor for non-positive intrinsic values', () => {
    expect(calculateBuyBelow(-1, 25)).toBe(0.01);
    expect(calculateBuyBelow(0, 25)).toBe(0.01);
  });
});
