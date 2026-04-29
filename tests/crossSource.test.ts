import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need the real production module (with its background spot-check) but
// none of the upstream HTTP/Yahoo subprocess work. Mock every fetcher.
vi.mock('../server/services/yahooFinance', () => ({
  getYahooFinanceData: vi.fn(),
}));
vi.mock('../server/services/rapidApiFinance', () => ({
  getRapidApiStockData: vi.fn(),
}));
vi.mock('../server/services/alphaVantage', () => ({
  getAlphaVantageData: vi.fn(),
}));
vi.mock('../server/services/webScraper', () => ({
  scrapeStockData: vi.fn(),
}));
vi.mock('../server/services/fallbackData', () => ({
  getFallbackStockData: vi.fn(),
}));

import { diffPayloads } from '../server/services/stockData';
import type { StockResponse } from '../shared/schema';

function payload(overrides: Partial<StockResponse> = {}): StockResponse {
  return {
    symbol: 'TEST',
    name: 'Test Co',
    price: 100,
    eps: 5,
    peRatio: 20,
    fcfPerShare: 4,
    growthRate: 10,
    roe: 15,
    debtToEquity: 1,
    currentRatio: 1.5,
    revenueGrowth: 8,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    ...overrides,
  } as StockResponse;
}

describe('diffPayloads — cross-source divergence detection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports no discrepancies when payloads agree exactly', () => {
    const a = payload();
    const b = payload();
    expect(diffPayloads(a, b, 'yfinance', 'rapidapi')).toEqual([]);
  });

  it('reports no discrepancies when fields are within the 15% tolerance', () => {
    const a = payload({ eps: 5.0 });
    const b = payload({ eps: 5.5 }); // 9% diff → under default 15% tolerance
    expect(diffPayloads(a, b, 'yfinance', 'rapidapi')).toEqual([]);
  });

  it('flags fields that diverge by more than 15%', () => {
    const a = payload({ eps: 5.0, price: 100 });
    const b = payload({ eps: 7.0, price: 100 }); // (7-5)/7 ≈ 28.57%
    const diffs = diffPayloads(a, b, 'yfinance', 'rapidapi');
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe('eps');
    expect(diffs[0].primarySource).toBe('yfinance');
    expect(diffs[0].secondarySource).toBe('rapidapi');
    expect(diffs[0].deltaPct).toBeGreaterThan(15);
  });

  it('skips fields where either side is zero/missing', () => {
    const a = payload({ peRatio: 0 });
    const b = payload({ peRatio: 25 });
    const diffs = diffPayloads(a, b, 'yfinance', 'rapidapi');
    // peRatio is skipped because primary is 0 → no discrepancy logged.
    expect(diffs.find(d => d.field === 'peRatio')).toBeUndefined();
  });

  it('flags multiple divergent fields independently', () => {
    const a = payload({ eps: 5, fcfPerShare: 4, growthRate: 10 });
    const b = payload({ eps: 8, fcfPerShare: 6.5, growthRate: 11 });
    const diffs = diffPayloads(a, b, 'rapidapi', 'alphavantage');
    const fields = diffs.map(d => d.field).sort();
    // eps: |5-8|/8 = 37.5%   → flagged
    // fcf: |4-6.5|/6.5 ≈ 38.5% → flagged
    // growth: |10-11|/11 ≈ 9% → not flagged
    expect(fields).toEqual(['eps', 'fcfPerShare']);
  });

  it('respects a custom tolerance percentage', () => {
    const a = payload({ price: 100 });
    const b = payload({ price: 105 }); // 4.76% diff
    expect(diffPayloads(a, b, 'yfinance', 'rapidapi', 10)).toEqual([]);
    expect(diffPayloads(a, b, 'yfinance', 'rapidapi', 1)).toHaveLength(1);
  });
});
