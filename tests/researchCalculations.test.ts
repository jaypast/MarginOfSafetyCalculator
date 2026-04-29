import { describe, it, expect } from 'vitest';
import { calculateIntrinsicValue, calculateDiscount } from '@/lib/researchCalculations';
import type { StockData } from '@/lib/types';

function stock(overrides: Partial<StockData> = {}): StockData {
  return {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 200,
    eps: 6,
    peRatio: 30,
    fcfPerShare: 6,
    growthRate: 10,
    roe: 30,
    debtToEquity: 1.5,
    currentRatio: 1.0,
    revenueGrowth: 8,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    ...overrides,
  };
}

describe('calculateIntrinsicValue (research pipeline)', () => {
  it('produces a positive intrinsic value for a healthy stock', () => {
    const value = calculateIntrinsicValue(stock());
    expect(value).toBeGreaterThan(0);
    expect(Number.isFinite(value)).toBe(true);
  });

  it('uses the actual current price for downstream discount calculation', () => {
    // If intrinsic value is meaningfully above current price, the discount
    // helper must report a positive discount (i.e. undervalued). The
    // previous bug reverse-engineered current price from `discountPremium`
    // and silently produced a *negative* discount when one input method
    // was capped. Here we verify the post-fix path.
    const s = stock({ price: 50, eps: 10, peRatio: 5, fcfPerShare: 10, growthRate: 10 });
    const intrinsic = calculateIntrinsicValue(s);
    expect(intrinsic).toBeGreaterThan(50);
    const discount = calculateDiscount(50, intrinsic);
    expect(discount).toBeGreaterThan(0);
  });

  it('returns ≤ 0 when the company has no positive earnings or cash flow', () => {
    const value = calculateIntrinsicValue(stock({ eps: -1, fcfPerShare: -1 }));
    expect(value).toBeLessThanOrEqual(0);
  });
});

describe('calculateDiscount', () => {
  it('reports 0% when current price equals intrinsic value', () => {
    expect(calculateDiscount(100, 100)).toBeCloseTo(0, 5);
  });

  it('reports a positive discount when undervalued', () => {
    // 80 vs 100 → 20% discount
    expect(calculateDiscount(80, 100)).toBeCloseTo(20, 1);
  });

  it('returns 0 sentinel for invalid inputs', () => {
    expect(calculateDiscount(0, 100)).toBe(0);
    expect(calculateDiscount(100, 0)).toBe(0);
  });
});
