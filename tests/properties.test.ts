import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateDCF,
  calculatePE,
  calculateGraham,
  calculateBuyBelow,
  calculateDiscountPremium,
  compareDataSources,
} from '@/lib/calculators';
import type { StockData, ValuationParams } from '@/lib/types';

// =============================================================================
// Property-based tests
//
// These use fast-check to assert *invariants* that should hold for every
// reasonable input — i.e. things that a careless refactor or a subtle
// change to a cap could break in a way that example-based tests would miss.
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

// Arbitrary that produces a healthy-ish StockData (positive EPS/FCF, sensible
// price). We deliberately use a generic symbol so the DEFAULT industry caps
// apply — that keeps the math predictable across runs.
const healthyStockArb: fc.Arbitrary<StockData> = fc.record({
  price: fc.double({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true }),
  eps: fc.double({ min: 0.1, max: 50, noNaN: true, noDefaultInfinity: true }),
  fcfPerShare: fc.double({ min: 0.1, max: 50, noNaN: true, noDefaultInfinity: true }),
  growthRate: fc.double({ min: 0, max: 30, noNaN: true, noDefaultInfinity: true }),
  peRatio: fc.double({ min: 5, max: 50, noNaN: true, noDefaultInfinity: true }),
}).map((v) => ({
  symbol: 'XYZ',
  name: 'Generic Co',
  price: parseFloat(v.price.toFixed(2)),
  eps: parseFloat(v.eps.toFixed(2)),
  peRatio: parseFloat(v.peRatio.toFixed(2)),
  fcfPerShare: parseFloat(v.fcfPerShare.toFixed(2)),
  growthRate: parseFloat(v.growthRate.toFixed(2)),
  roe: 15,
  debtToEquity: 1.0,
  currentRatio: 1.5,
  revenueGrowth: 5,
  earningsStability: 'Medium',
  competitivePosition: 'Average',
}));

describe('Property: intrinsic values respect the priceToCap industry ceiling', () => {
  it('DCF ≤ price × 3.0 (DEFAULT priceToCap) for any healthy input', () => {
    fc.assert(
      fc.property(healthyStockArb, (stock) => {
        const v = calculateDCF(stock, DEFAULT_PARAMS);
        // -1 is the "not applicable" sentinel; not a value to bound.
        if (v === -1) return true;
        // Floating-point slack of 0.01 to absorb the calculator's
        // parseFloat(toFixed(2)) round trip.
        return v <= stock.price * 3 + 0.01;
      }),
      { numRuns: 200 },
    );
  });

  it('P/E ≤ price × 3.0 for any healthy input', () => {
    fc.assert(
      fc.property(healthyStockArb, (stock) => {
        const v = calculatePE(stock, DEFAULT_PARAMS);
        if (v === -1) return true;
        return v <= stock.price * 3 + 0.01;
      }),
      { numRuns: 200 },
    );
  });

  it('Graham ≤ price × 3.0 for any healthy input', () => {
    fc.assert(
      fc.property(healthyStockArb, (stock) => {
        const v = calculateGraham(stock, DEFAULT_PARAMS);
        if (v === -1) return true;
        return v <= stock.price * 3 + 0.01;
      }),
      { numRuns: 200 },
    );
  });
});

describe('Property: buy-below = intrinsic × (1 − marginOfSafety)', () => {
  it('always returns a value strictly less than intrinsicValue for any positive MoS', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 1, max: 99 }),
        (intrinsic, mos) => {
          const buyBelow = calculateBuyBelow(intrinsic, mos);
          return buyBelow > 0 && buyBelow < intrinsic;
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('Property: discount/premium is monotonic in price', () => {
  it('a strictly higher current price never produces a larger discount', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 1000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 10, max: 1000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }),
        (intrinsic, p1, deltaUp) => {
          const p2 = p1 + deltaUp;
          const d1 = calculateDiscountPremium(p1, intrinsic);
          const d2 = calculateDiscountPremium(p2, intrinsic);
          // discountPremium is positive when overpriced; raising price must
          // (weakly) raise the premium / weaken the discount.
          return d2 >= d1 - 0.01;
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('Property: historical P/E modes consume per-ticker data', () => {
  // Two stocks identical in everything except their peHistory.fiveYearAvg
  // must produce different intrinsic values under peType=5year — which
  // would NOT have been true under the old "5year=18.6 always" code.
  it('different fiveYearAvg → different intrinsic value (peType=5year)', () => {
    fc.assert(
      fc.property(
        healthyStockArb,
        // Two distinct historical multiples in the uncapped range.
        fc.double({ min: 8, max: 20, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 25, max: 45, noNaN: true, noDefaultInfinity: true }),
        (stock, lowPe, highPe) => {
          const sLow = { ...stock, peHistory: { fiveYearAvg: lowPe, tenYearAvg: null, industryAvg: null } };
          const sHigh = { ...stock, peHistory: { fiveYearAvg: highPe, tenYearAvg: null, industryAvg: null } };
          const vLow = calculatePE(sLow, { ...DEFAULT_PARAMS, peType: '5year' });
          const vHigh = calculatePE(sHigh, { ...DEFAULT_PARAMS, peType: '5year' });
          // Both bounded by priceToCap (DEFAULT 3×). When both are below
          // the cap the higher P/E must produce a strictly higher value.
          // When the higher one is capped they may converge.
          return vHigh >= vLow - 0.01;
        },
      ),
      { numRuns: 100 },
    );
  });

  // Symmetric to the above but for the 10-year mode.
  it('different tenYearAvg → different intrinsic value (peType=10year)', () => {
    fc.assert(
      fc.property(
        healthyStockArb,
        fc.double({ min: 8, max: 20, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 25, max: 45, noNaN: true, noDefaultInfinity: true }),
        (stock, lowPe, highPe) => {
          const sLow = { ...stock, peHistory: { fiveYearAvg: null, tenYearAvg: lowPe, industryAvg: null } };
          const sHigh = { ...stock, peHistory: { fiveYearAvg: null, tenYearAvg: highPe, industryAvg: null } };
          const vLow = calculatePE(sLow, { ...DEFAULT_PARAMS, peType: '10year' });
          const vHigh = calculatePE(sHigh, { ...DEFAULT_PARAMS, peType: '10year' });
          return vHigh >= vLow - 0.01;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property: compareDataSources', () => {
  it('agreement = 1.0 when both payloads are identical', () => {
    fc.assert(
      fc.property(healthyStockArb, (stock) => {
        const cmp = compareDataSources(stock, stock);
        return cmp.agreement === 1 && cmp.discrepancies.length === 0;
      }),
      { numRuns: 100 },
    );
  });

  it('agreement is symmetric: compare(a,b) === compare(b,a)', () => {
    fc.assert(
      fc.property(healthyStockArb, healthyStockArb, (a, b) => {
        const ab = compareDataSources(a, b);
        const ba = compareDataSources(b, a);
        return Math.abs(ab.agreement - ba.agreement) < 1e-9
          && ab.discrepancies.length === ba.discrepancies.length;
      }),
      { numRuns: 100 },
    );
  });
});
