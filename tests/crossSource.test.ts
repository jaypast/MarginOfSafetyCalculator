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

import {
  diffPayloads,
  getStockData,
  __awaitPendingSpotChecks,
  __resetStockDataCache,
  __expireStockDataCache,
} from '../server/services/stockData';
import { getYahooFinanceData } from '../server/services/yahooFinance';
import { getRapidApiStockData } from '../server/services/rapidApiFinance';
import { getAlphaVantageData } from '../server/services/alphaVantage';
import { scrapeStockData } from '../server/services/webScraper';
import { getFallbackStockData } from '../server/services/fallbackData';
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

// End-to-end capture-and-attach: when the primary fetch succeeds and the
// background spot-check finds divergence with the secondary, the next
// `getStockData` call must surface the divergence on the response payload.
describe('getStockData — cross-source divergence capture & attach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetStockDataCache();
  });

  it('attaches crossSourceDivergence to the response after a divergent spot-check', async () => {
    const symbol = 'DIVG1';

    // Primary (yfinance) — EPS 5
    vi.mocked(getYahooFinanceData).mockResolvedValue(payload({
      symbol,
      eps: 5,
      price: 100,
      peRatio: 20,
      fcfPerShare: 4,
      growthRate: 10,
    }));
    // Secondary (rapidapi) — EPS 8 → ~37.5% delta, well over 15% tolerance
    vi.mocked(getRapidApiStockData).mockResolvedValue(payload({
      symbol,
      eps: 8,
      price: 100,
      peRatio: 20,
      fcfPerShare: 4,
      growthRate: 10,
    }));

    // First call kicks off the fire-and-forget spot-check.
    await getStockData(symbol);
    // Wait for the spot-check to complete and record into the cache.
    await __awaitPendingSpotChecks();

    // Second call serves from cache and must include the captured divergence.
    const second = await getStockData(symbol);
    expect(second.crossSourceDivergence).toBeTruthy();
    const div = second.crossSourceDivergence!;
    expect(div.sourceA).toBe('yfinance');
    expect(div.sourceB).toBe('rapidapi');
    expect(typeof div.checkedAt).toBe('string');
    const epsField = div.fields.find((f) => f.field === 'eps');
    expect(epsField).toBeDefined();
    expect(epsField!.valueA).toBe(5);
    expect(epsField!.valueB).toBe(8);
    expect(epsField!.deltaPct).toBeGreaterThan(15);
  });

  it('attaches crossSourceDivergence: null when the spot-check finds agreement', async () => {
    const symbol = 'DIVG2';
    const agreed = payload({ symbol, eps: 5, price: 100, peRatio: 20, fcfPerShare: 4, growthRate: 10 });
    vi.mocked(getYahooFinanceData).mockResolvedValue(agreed);
    vi.mocked(getRapidApiStockData).mockResolvedValue({ ...agreed });

    await getStockData(symbol);
    await __awaitPendingSpotChecks();
    const second = await getStockData(symbol);
    expect(second.crossSourceDivergence).toBeNull();
  });

  it('attaches divergence when the static fallback disagrees with the cached primary', async () => {
    const symbol = 'DIVG3';

    // 1. Seed a live primary into the cache (yfinance), with the secondary
    //    spot-check agreeing so the cached entry's `divergence` slot is null.
    const primaryPayload = payload({
      symbol, eps: 5, price: 100, peRatio: 20, fcfPerShare: 4, growthRate: 10,
    });
    vi.mocked(getYahooFinanceData).mockResolvedValueOnce(primaryPayload);
    vi.mocked(getRapidApiStockData).mockResolvedValueOnce({ ...primaryPayload });
    await getStockData(symbol);
    await __awaitPendingSpotChecks();

    // 2. Age the cached entry so the next call is treated as a miss and walks
    //    the fetch pipeline all the way down to the static fallback.
    __expireStockDataCache(symbol);

    // 3. Make every live source fail, then have the static fallback return EPS
    //    that is materially different from the cached primary (5 vs 9 ≈ 44%).
    vi.mocked(getYahooFinanceData).mockRejectedValueOnce(new Error('rate limited'));
    vi.mocked(getRapidApiStockData).mockRejectedValueOnce(new Error('429'));
    vi.mocked(getAlphaVantageData).mockRejectedValueOnce(new Error('no key'));
    vi.mocked(scrapeStockData).mockRejectedValueOnce(new Error('blocked'));
    vi.mocked(getFallbackStockData).mockReturnValueOnce(payload({
      symbol, eps: 9, price: 100, peRatio: 20, fcfPerShare: 4, growthRate: 10,
    }));

    // 4. The fallback branch should compute divergence vs. the cached primary
    //    and attach it to the returned payload.
    const fallbackResp = await getStockData(symbol);
    expect(fallbackResp.crossSourceDivergence).toBeTruthy();
    const div = fallbackResp.crossSourceDivergence!;
    expect(div.sourceA).toBe('yfinance'); // the cached primary's source
    expect(div.sourceB).toBe('fallback');
    const epsField = div.fields.find((f) => f.field === 'eps');
    expect(epsField).toBeDefined();
    expect(epsField!.valueA).toBe(5);
    expect(epsField!.valueB).toBe(9);
    expect(epsField!.deltaPct).toBeGreaterThan(15);
  });
});
