// Unit tests for buildDecisionHeadline (Task #34).
//
// The helper is pure — no React, no DOM — so these tests run with standard
// Vitest in the Node environment alongside the other lib tests.

import { describe, it, expect } from 'vitest';
import { buildDecisionHeadline } from '../client/src/lib/decisionHeadline';
import type { StockData, ValuationResult } from '../client/src/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStock(overrides: Partial<StockData> = {}): StockData {
  return {
    symbol: 'TST',
    name: 'Test Co.',
    price: 100,
    eps: 5,
    peRatio: 20,
    fcfPerShare: 5,
    growthRate: 10,
    roe: 15,
    debtToEquity: 0.5,
    currentRatio: 2,
    revenueGrowth: 8,
    earningsStability: 'High',
    competitivePosition: 'Good',
    ...overrides,
  };
}

function makeResults(avgIntrinsic: number, avgBuyBelow: number): ValuationResult[] {
  return [
    {
      method: 'DCF Analysis',
      intrinsicValue: avgIntrinsic * 1.1,
      buyBelow: avgBuyBelow * 1.1,
      discountPremium: 10,
    },
    {
      method: 'P/E Based',
      intrinsicValue: avgIntrinsic * 0.9,
      buyBelow: avgBuyBelow * 0.9,
      discountPremium: 10,
    },
    {
      method: 'Graham Formula',
      intrinsicValue: avgIntrinsic * 1.0,
      buyBelow: avgBuyBelow * 1.0,
      discountPremium: 10,
    },
    {
      method: 'Average',
      intrinsicValue: avgIntrinsic,
      buyBelow: avgBuyBelow,
      discountPremium: 10,
    },
  ];
}

// ---------------------------------------------------------------------------
// no_stock cases
// ---------------------------------------------------------------------------

describe('buildDecisionHeadline — no_stock', () => {
  it('returns unavailable when stockData is undefined', () => {
    const r = buildDecisionHeadline(undefined, [], 25);
    expect(r.available).toBe(false);
    if (!r.available) expect(r.reason).toBe('no_stock');
  });

  it('returns unavailable when stockData has error flag', () => {
    const stock = makeStock({ error: true });
    const r = buildDecisionHeadline(stock, [], 25);
    expect(r.available).toBe(false);
    if (!r.available) expect(r.reason).toBe('no_stock');
  });
});

// ---------------------------------------------------------------------------
// loading case
// ---------------------------------------------------------------------------

describe('buildDecisionHeadline — loading', () => {
  it('returns loading when valuationResults is empty', () => {
    const stock = makeStock();
    const r = buildDecisionHeadline(stock, [], 25);
    expect(r.available).toBe(false);
    if (!r.available) expect(r.reason).toBe('loading');
  });
});

// ---------------------------------------------------------------------------
// unmodelable case
// ---------------------------------------------------------------------------

describe('buildDecisionHeadline — unmodelable', () => {
  it('returns unmodelable when no Average row is present', () => {
    const stock = makeStock();
    const results: ValuationResult[] = [
      { method: 'DCF Analysis', intrinsicValue: 130, buyBelow: 97.5, discountPremium: 10 },
    ];
    const r = buildDecisionHeadline(stock, results, 25);
    expect(r.available).toBe(false);
    if (!r.available) expect(r.reason).toBe('unmodelable');
  });

  it('returns unmodelable when Average intrinsicValue is 0', () => {
    const stock = makeStock();
    const r = buildDecisionHeadline(stock, makeResults(0, 0), 25);
    expect(r.available).toBe(false);
    if (!r.available) expect(r.reason).toBe('unmodelable');
  });

  it('returns unmodelable when Average buyBelow is negative', () => {
    const stock = makeStock();
    const r = buildDecisionHeadline(stock, makeResults(130, -10), 25);
    expect(r.available).toBe(false);
    if (!r.available) expect(r.reason).toBe('unmodelable');
  });
});

// ---------------------------------------------------------------------------
// zone classification
// ---------------------------------------------------------------------------

describe('buildDecisionHeadline — zone = buy', () => {
  it('classifies buy when price < buyBelow', () => {
    // price=80, buyBelow=97.5 → price is below → buy zone
    const stock = makeStock({ price: 80 });
    const r = buildDecisionHeadline(stock, makeResults(130, 97.5), 25);
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.zone).toBe('buy');
  });

  it('classifies buy when price equals buyBelow exactly', () => {
    const stock = makeStock({ price: 97.5 });
    const r = buildDecisionHeadline(stock, makeResults(130, 97.5), 25);
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.zone).toBe('buy');
  });

  it('sentence says "below" and mentions buy zone', () => {
    const stock = makeStock({ price: 80 });
    const r = buildDecisionHeadline(stock, makeResults(130, 97.5), 25);
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.sentence).toMatch(/below/i);
    expect(r.sentence).toMatch(/buy zone/i);
  });

  it('pctVsBuyBelow is negative when in buy zone', () => {
    const stock = makeStock({ price: 80 });
    const r = buildDecisionHeadline(stock, makeResults(130, 97.5), 25);
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.pctVsBuyBelow).toBeLessThan(0);
  });
});

describe('buildDecisionHeadline — zone = near', () => {
  it('classifies near when price is within 10% above buyBelow', () => {
    // price = 105, buyBelow = 97.5 → ~7.7% above → near
    const stock = makeStock({ price: 105 });
    const r = buildDecisionHeadline(stock, makeResults(130, 97.5), 25);
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.zone).toBe('near');
  });

  it('sentence says "above" and mentions "getting close"', () => {
    const stock = makeStock({ price: 105 });
    const r = buildDecisionHeadline(stock, makeResults(130, 97.5), 25);
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.sentence).toMatch(/above/i);
    expect(r.sentence).toMatch(/getting close/i);
  });
});

describe('buildDecisionHeadline — zone = neutral', () => {
  it('classifies neutral when price is more than 10% above buyBelow', () => {
    // price = 200, buyBelow = 97.5 → ~105% above → neutral
    const stock = makeStock({ price: 200 });
    const r = buildDecisionHeadline(stock, makeResults(130, 97.5), 25);
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.zone).toBe('neutral');
  });

  it('sentence mentions above and buy-below price', () => {
    const stock = makeStock({ price: 200 });
    const r = buildDecisionHeadline(stock, makeResults(130, 97.5), 25);
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.sentence).toMatch(/above/i);
    expect(r.sentence).toMatch(/buy-below/i);
  });
});

// ---------------------------------------------------------------------------
// sentence content
// ---------------------------------------------------------------------------

describe('buildDecisionHeadline — sentence', () => {
  it('includes the MoS percentage in the sentence', () => {
    const stock = makeStock({ price: 80 });
    const r = buildDecisionHeadline(stock, makeResults(130, 97.5), 30);
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.sentence).toContain('30%');
  });

  it('includes "intrinsic value" in the sentence', () => {
    const stock = makeStock({ price: 200 });
    const r = buildDecisionHeadline(stock, makeResults(130, 97.5), 25);
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.sentence).toMatch(/intrinsic value/i);
  });

  it('reports the correct intrinsicValue and buyBelow from the Average row', () => {
    const stock = makeStock({ price: 80 });
    const r = buildDecisionHeadline(stock, makeResults(130, 97.5), 25);
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.intrinsicValue).toBeCloseTo(130, 1);
    expect(r.buyBelow).toBeCloseTo(97.5, 1);
  });
});

