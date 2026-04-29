import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateDCF,
  calculateDCFDetailed,
  calculateReverseDCF,
  calculateReverseDCFDetailed,
} from '@/lib/calculators';
import type { StockData, ValuationParams } from '@/lib/types';

// =============================================================================
// Reverse-DCF tests
//
// Three layers of confidence:
//   1. Round-trip property — for healthy inputs where no caps bind, the
//      forward DCF at growth g produces price P, and the reverse DCF at
//      price P should recover g (within a tight tolerance).
//   2. Edge cases — negative FCF, both FCF and EPS negative, bracket
//      failures (above 100 % implied growth, below -50 %).
//   3. Golden values — locked-in implied growths for AAPL / JPM / Toyota
//      fixtures shared with the forward-DCF golden suite. These break if
//      anyone changes the math without updating the locked-in numbers.
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

// Generic-symbol stock so the DEFAULT industry caps apply (priceToCap=3,
// fcfMultipleCap=30, growthRateCap=20). Using a non-mapped symbol keeps the
// math predictable across runs.
function makeHealthy(overrides: Partial<StockData> = {}): StockData {
  return {
    symbol: 'XYZQ',
    name: 'Generic Healthy Co',
    price: 100,
    eps: 5,
    peRatio: 20,
    fcfPerShare: 5,
    growthRate: 10,
    roe: 18,
    debtToEquity: 1.0,
    currentRatio: 1.5,
    revenueGrowth: 8,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    ...overrides,
  };
}

describe('calculateReverseDCFDetailed — basic shape', () => {
  it('returns a finite implied growth rate and a non-empty interpretation', () => {
    const out = calculateReverseDCFDetailed(makeHealthy(), p());
    expect(Number.isFinite(out.impliedGrowthRate)).toBe(true);
    expect(out.status).toBe('solved');
    expect(out.interpretation.length).toBeGreaterThan(0);
  });

  it('exposes the same number via the thin wrapper', () => {
    const detail = calculateReverseDCFDetailed(makeHealthy(), p());
    const wrapped = calculateReverseDCF(makeHealthy(), p());
    expect(wrapped).toBeCloseTo(detail.impliedGrowthRate, 4);
  });
});

describe('Round-trip property — forward(g) → P → reverse(P) recovers g', () => {
  it('recovers the input growth within 0.1 pt for healthy inputs (sample)', () => {
    // Spot-check a handful of growth values where no caps bind for the
    // healthy-stock fixture: forward NPV stays under priceToCap × price
    // (3 × 100 = 300) AND under fcfMultipleCap × FCF (30 × 5 = 150). At
    // higher growths the FCF cap clamps the forward output to a flat
    // value, which makes the round-trip ambiguous (every g above the
    // clamp threshold produces the same NPV) — so we deliberately stay in
    // the well-behaved regime here. The property test below covers the
    // wider range with explicit cap-skip logic.
    for (const g of [3, 6, 8, 10, 12]) {
      const stock = makeHealthy({ price: 100, fcfPerShare: 5, eps: 5, growthRate: g });
      const forwardPrice = calculateDCF(stock, p({ dcfGrowthRate: g }));
      const stockAtForwardPrice = { ...stock, price: forwardPrice };
      const implied = calculateReverseDCF(stockAtForwardPrice, p());
      expect(implied).toBeCloseTo(g, 1);
    }
  });

  it('round-trips for a wide swath of healthy inputs (property-based)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 3, max: 18, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 1, max: 20, noNaN: true, noDefaultInfinity: true }),
        (g, fcf) => {
          const stock = makeHealthy({
            price: 100,
            fcfPerShare: fcf,
            // Keep eps proportional to FCF so the FCF/EPS sanity cap (FCF >
            // 3×EPS → cap to 2.5×EPS) never fires and skews the round-trip.
            eps: fcf,
            growthRate: g,
          });
          const forwardPrice = calculateDCF(stock, p({ dcfGrowthRate: g }));
          // Skip pathological forward outputs where caps clamped the value
          // (round-trip can't recover g if forward DCF was clamped).
          if (forwardPrice <= 0 || forwardPrice >= 100 * 3 - 0.5) return true;
          if (forwardPrice >= fcf * 30 - 0.5) return true;
          const implied = calculateReverseDCF({ ...stock, price: forwardPrice }, p());
          return Math.abs(implied - g) < 0.2;
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('Edge cases', () => {
  it('returns -1 / not_applicable when FCF is non-positive (no EPS fallback)', () => {
    // Spec: reverse DCF should refuse to run when FCF ≤ 0, regardless of
    // EPS. Using a derived FCF would silently change what question is
    // being answered ("market-implied growth" vs. "growth that would
    // justify a synthesized FCF").
    for (const fcf of [-1, 0]) {
      const out = calculateReverseDCFDetailed(
        makeHealthy({ fcfPerShare: fcf, eps: 5 }),
        p(),
      );
      expect(out.impliedGrowthRate).toBe(-1);
      expect(out.status).toBe('not_applicable');
      expect(out.interpretation).toMatch(/not applicable/i);
      expect(out.appliedAdjustments.join(' ')).toMatch(/FCF non-positive/i);
    }
  });

  it('returns not_applicable even when EPS is also negative', () => {
    const out = calculateReverseDCFDetailed(
      makeHealthy({ fcfPerShare: -1, eps: -2 }),
      p(),
    );
    expect(out.status).toBe('not_applicable');
    expect(out.impliedGrowthRate).toBe(-1);
  });

  it('returns not_applicable when current price is non-positive', () => {
    const out = calculateReverseDCFDetailed(makeHealthy({ price: 0 }), p());
    expect(out.status).toBe('not_applicable');
    expect(out.impliedGrowthRate).toBe(-1);
  });

  it('clamps to the upper boundary (>50 %) when the price is unreachable', () => {
    // Tiny FCF + huge price → no growth rate up to the +50 % cap can
    // lift NPV that high.
    const out = calculateReverseDCFDetailed(
      makeHealthy({ price: 10000, fcfPerShare: 0.01, eps: 0.01, growthRate: 5 }),
      p(),
    );
    expect(out.status).toBe('above_max');
    expect(out.impliedGrowthRate).toBe(50);
    expect(out.interpretation).toMatch(/above 50/i);
  });

  it('clamps to the lower boundary (<-50 %) when the price is far below model floor', () => {
    // Healthy FCF + trivial price → even -50 % growth produces an NPV above
    // the price.
    const out = calculateReverseDCFDetailed(
      makeHealthy({ price: 0.01, fcfPerShare: 5, eps: 5, growthRate: 5 }),
      p(),
    );
    expect(out.status).toBe('below_min');
    expect(out.impliedGrowthRate).toBe(-50);
    expect(out.interpretation).toMatch(/below -50/i);
  });
});

describe('Interpretation text — historical comparison', () => {
  it('flags the market as more optimistic when implied > historical by ≥0.5 pt', () => {
    // Choose a price that produces an implied growth clearly above the
    // historical 5 %.
    const stock = makeHealthy({ growthRate: 5, price: 150, fcfPerShare: 5, eps: 5 });
    const out = calculateReverseDCFDetailed(stock, p());
    if (out.status === 'solved' && out.impliedGrowthRate - 5 >= 0.5) {
      expect(out.interpretation).toMatch(/optimistic/i);
    }
  });

  it('flags the market as more pessimistic when implied < historical by ≥0.5 pt', () => {
    const stock = makeHealthy({ growthRate: 18, price: 60, fcfPerShare: 5, eps: 5 });
    const out = calculateReverseDCFDetailed(stock, p());
    if (out.status === 'solved' && 18 - out.impliedGrowthRate >= 0.5) {
      expect(out.interpretation).toMatch(/pessimistic/i);
    }
  });

  it('omits the historical comparison when historical growth is missing', () => {
    const out = calculateReverseDCFDetailed(
      makeHealthy({ growthRate: 0 }),
      p(),
    );
    expect(out.interpretation).toMatch(/no historical growth/i);
  });
});

// =============================================================================
// Golden values — re-uses the AAPL / JPM / Toyota fixtures from the
// forward-DCF golden suite so any drift between forward and reverse models
// surfaces immediately.
// =============================================================================
describe('Golden values — AAPL / JPM / Toyota', () => {
  it('AAPL implied growth round-trips against its forward DCF golden', () => {
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
    // Forward DCF at the default 10 % growth produces 134.16 (golden).
    // Reverse-DCF at THAT price must recover ~10 %.
    const forwardPrice = calculateDCFDetailed(aapl, p()).value;
    expect(forwardPrice).toBeCloseTo(134.16, 2);
    const implied = calculateReverseDCF({ ...aapl, price: forwardPrice }, p());
    expect(implied).toBeCloseTo(10, 1);

    // At the actual market price of 170 (≈27 % premium to the forward DCF),
    // the implied growth must be meaningfully higher than 10 %.
    const impliedAtMarket = calculateReverseDCF(aapl, p());
    expect(impliedAtMarket).toBeGreaterThan(10);
  });

  it('JPM implied growth round-trips against its forward DCF golden', () => {
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
    // JPM's forward DCF golden is 180 (FCF cap binds at 15× FCF). Round-trip
    // through the reverse DCF must land in a regime that justifies that
    // price — and the implied growth at the market price of 160 must be
    // strictly less than the implied growth at 180 (price below cap → less
    // growth required).
    const impliedAtMarket = calculateReverseDCF(jpm, p());
    const impliedAtForwardPrice = calculateReverseDCF({ ...jpm, price: 180 }, p());
    expect(impliedAtMarket).toBeLessThan(impliedAtForwardPrice);
    expect(Number.isFinite(impliedAtMarket)).toBe(true);
  });

  it('Toyota: reverse DCF still produces a finite implied growth despite special-case caps', () => {
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
    const out = calculateReverseDCFDetailed(toyota, p());
    expect(out.status).toBe('solved');
    expect(Number.isFinite(out.impliedGrowthRate)).toBe(true);
    // 7203.T's forward DCF golden is 3556.59 — i.e. forward sees Toyota as
    // undervalued. Therefore the implied growth at the lower market price
    // (2500) must be below the forward DCF's input growth (10 %).
    expect(out.impliedGrowthRate).toBeLessThan(10);
  });
});
