import { describe, it, expect } from 'vitest';
import { calculateIntrinsicValue, calculateDiscount } from '@/lib/researchCalculations';
import type { StockData } from '@/lib/types';
import { stockResponseSchema } from '@shared/schema';
import { getMultibaggerSignalNotes } from '@/components/ValueInvestorVerdict';

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

// Task #30 — confirm the new multibaggerSignals block flows from
// schema → typed StockData → signal-fire helper end-to-end. If any
// link in the chain drops the field, this test trips immediately.
describe('multibaggerSignals end-to-end (Task #30)', () => {
  const baseResponse = {
    symbol: 'CASH',
    name: 'Cash Burner Co.',
    price: 100,
    eps: 2,
    peRatio: 50,
    fcfPerShare: -5,
    growthRate: 5,
    roe: 5,
    debtToEquity: 1,
    currentRatio: 1,
    revenueGrowth: 5,
    earningsStability: 'Low' as const,
    competitivePosition: 'Average' as const,
  };

  it('schema accepts a multibaggerSignals block and the signal helper records every fired signal', () => {
    const parsed = stockResponseSchema.parse({
      ...baseResponse,
      multibaggerSignals: {
        fcfYield: -2,
        assetGrowth: 25,
        ebitdaGrowth: 10,
        week52High: 110,
        week52Low: 50,
      },
    });
    expect(parsed.multibaggerSignals?.fcfYield).toBe(-2);
    expect(parsed.multibaggerSignals?.week52High).toBe(110);

    // The same parsed payload is what the client consumes; pipe it
    // into the signal-fire aggregator and assert all three signals
    // surface as applied-adjustments notes.
    const notes = getMultibaggerSignalNotes(parsed as unknown as StockData);
    expect(notes.some((n) => /Cash-quality gate fired/i.test(n))).toBe(true);
    expect(notes.some((n) => /Investment unaffordability/i.test(n))).toBe(true);
    expect(notes.some((n) => /Near 52-week high/i.test(n))).toBe(true);
  });

  it('schema accepts an explicit null multibaggerSignals block (adapter contract)', () => {
    // Use a neutral fcfPerShare (positive but below 5% yield) so the
    // cash-quality fallback path doesn't fire either — proves the
    // null contract carries through with no spurious notes.
    const parsed = stockResponseSchema.parse({
      ...baseResponse,
      fcfPerShare: 2,
      multibaggerSignals: null,
    });
    expect(parsed.multibaggerSignals).toBeNull();
    expect(getMultibaggerSignalNotes(parsed as unknown as StockData)).toEqual([]);
  });

  it('schema accepts a partially-null multibaggerSignals block (per-field independence)', () => {
    const parsed = stockResponseSchema.parse({
      ...baseResponse,
      multibaggerSignals: {
        fcfYield: 7,
        assetGrowth: null,
        ebitdaGrowth: null,
        week52High: null,
        week52Low: null,
      },
    });
    const notes = getMultibaggerSignalNotes(parsed as unknown as StockData);
    expect(notes.some((n) => /promotion/i.test(n))).toBe(true);
    expect(notes.some((n) => /Investment unaffordability/i.test(n))).toBe(false);
    expect(notes.some((n) => /Near 52-week high/i.test(n))).toBe(false);
  });
});
