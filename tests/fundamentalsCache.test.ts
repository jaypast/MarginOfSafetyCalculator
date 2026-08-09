import { describe, it, expect, vi, beforeEach } from 'vitest';

// Exercise the persistent fundamentals cache (Task #58) end-to-end through
// the production fetch pipeline, with every upstream and the storage layer
// mocked. The real recombination math is also unit-tested directly.
vi.mock('../server/services/yahooFinance', () => ({
  getYahooFinanceData: vi.fn(),
}));
vi.mock('../server/services/rapidApiFinance', () => ({
  getRapidApiStockData: vi.fn(),
}));
vi.mock('../server/services/alphaVantage', () => ({
  getAlphaVantageData: vi.fn(),
}));
vi.mock('../server/services/fmpFinance', () => ({
  getFmpData: vi.fn(),
}));
vi.mock('../server/services/webScraper', () => ({
  scrapeStockData: vi.fn(),
  getQuickPrice: vi.fn(),
}));
vi.mock('../server/services/fallbackData', () => ({
  getFallbackStockData: vi.fn(),
}));
vi.mock('../server/storage', () => ({
  storage: {
    getFundamentalsCache: vi.fn(),
    upsertFundamentalsCache: vi.fn(),
  },
}));

import {
  getStockData,
  recombineCachedFundamentals,
  __resetStockDataCache,
  __awaitPendingSpotChecks,
  FUNDAMENTALS_TTL_MS,
  RANGE_TTL_MS,
  PE_HISTORY_TTL_MS,
} from '../server/services/stockData';
import { getYahooFinanceData } from '../server/services/yahooFinance';
import { getRapidApiStockData } from '../server/services/rapidApiFinance';
import { getAlphaVantageData } from '../server/services/alphaVantage';
import { getFmpData } from '../server/services/fmpFinance';
import { scrapeStockData, getQuickPrice } from '../server/services/webScraper';
import { getFallbackStockData } from '../server/services/fallbackData';
import { storage } from '../server/storage';
import type { StockResponse, FundamentalsCacheRow } from '../shared/schema';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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
    dataSource: 'yfinance',
    fetchedAt: new Date().toISOString(),
    appliedAdjustments: [],
    peHistory: { fiveYearAvg: 18, tenYearAvg: 16, industryAvg: 21 },
    multibaggerSignals: {
      fcfYield: 5,
      assetGrowth: 3,
      ebitdaGrowth: 6,
      week52High: 150,
      week52Low: 80,
    },
    marketCap: 1_000_000_000,
    ...overrides,
  } as StockResponse;
}

function cacheRow(p: StockResponse, ageMs: number): FundamentalsCacheRow {
  return {
    id: 1,
    symbol: p.symbol,
    payload: p,
    dataSource: p.dataSource ?? 'yfinance',
    fetchedAt: new Date(Date.now() - ageMs),
  };
}

function failAllLiveSources() {
  vi.mocked(getYahooFinanceData).mockRejectedValue(new Error('rate limited'));
  vi.mocked(getRapidApiStockData).mockRejectedValue(new Error('429'));
  vi.mocked(getAlphaVantageData).mockRejectedValue(new Error('no key'));
  vi.mocked(getFmpData).mockRejectedValue(new Error('403'));
  vi.mocked(scrapeStockData).mockRejectedValue(new Error('blocked'));
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetStockDataCache();
  failAllLiveSources();
  vi.mocked(getQuickPrice).mockRejectedValue(new Error('quote unavailable'));
  vi.mocked(getFallbackStockData).mockReturnValue(undefined as any);
  vi.mocked(storage.getFundamentalsCache).mockResolvedValue(undefined);
  vi.mocked(storage.upsertFundamentalsCache).mockResolvedValue({} as any);
});

// ---------------------------------------------------------------------------
// Pure recombination math
// ---------------------------------------------------------------------------
describe('recombineCachedFundamentals — price-derived field recomputation', () => {
  const now = Date.now();

  it('recomputes price, P/E, marketCap and fcfYield from the fresh price', () => {
    const cached = payload({ price: 100, eps: 5, peRatio: 20 });
    const out = recombineCachedFundamentals(
      cached, new Date(now - 2 * HOUR), 110,
      { priceIsLive: true, note: 'test note' }, now,
    );
    expect(out.price).toBe(110);
    expect(out.peRatio).toBe(22); // 110 / 5
    expect(out.marketCap).toBe(1_100_000_000); // scaled by 110/100
    expect(out.multibaggerSignals!.fcfYield).toBeCloseTo(5 * (100 / 110), 4);
    expect(out.appliedAdjustments).toContain('test note');
    // Slow-changing fields come straight from the cache.
    expect(out.eps).toBe(5);
    expect(out.roe).toBe(15);
  });

  it('keeps the 52-week range within RANGE_TTL_MS and drops it after', () => {
    const cached = payload();
    const fresh = recombineCachedFundamentals(
      cached, new Date(now - 2 * HOUR), 100,
      { priceIsLive: true, note: 'n' }, now,
    );
    expect(fresh.multibaggerSignals!.week52High).toBe(150);
    expect(fresh.multibaggerSignals!.week52Low).toBe(80);

    const stale = recombineCachedFundamentals(
      cached, new Date(now - 3 * DAY), 100,
      { priceIsLive: true, note: 'n' }, now,
    );
    expect(stale.multibaggerSignals!.week52High).toBeNull();
    expect(stale.multibaggerSignals!.week52Low).toBeNull();
    expect(stale.appliedAdjustments!.join(' ')).toContain('52-week range omitted');
    // Other multibagger fields survive the range expiry.
    expect(stale.multibaggerSignals!.assetGrowth).toBe(3);
  });

  it('keeps peHistory within PE_HISTORY_TTL_MS and drops it after', () => {
    const cached = payload();
    const within = recombineCachedFundamentals(
      cached, new Date(now - 20 * DAY), 100,
      { priceIsLive: true, note: 'n' }, now,
    );
    expect(within.peHistory).toEqual({ fiveYearAvg: 18, tenYearAvg: 16, industryAvg: 21 });

    const past = recombineCachedFundamentals(
      cached, new Date(now - 31 * DAY), 100,
      { priceIsLive: true, note: 'n' }, now,
    );
    expect(past.peHistory).toBeNull();
    expect(past.appliedAdjustments!.join(' ')).toContain('Historical P/E omitted');
  });

  it('leaves price-derived fields untouched when the price is not live', () => {
    const cached = payload({ price: 100, eps: 5, peRatio: 20 });
    const out = recombineCachedFundamentals(
      cached, new Date(now - 2 * HOUR), cached.price,
      { priceIsLive: false, note: 'stale note' }, now,
    );
    expect(out.price).toBe(100);
    expect(out.peRatio).toBe(20);
    expect(out.marketCap).toBe(1_000_000_000);
    expect(out.multibaggerSignals!.fcfYield).toBe(5);
    expect(out.appliedAdjustments).toContain('stale note');
  });

  it('keeps honest provenance: original dataSource and true fetchedAt', () => {
    const fetchedAt = new Date(now - 2 * DAY);
    const out = recombineCachedFundamentals(
      payload({ dataSource: 'fmp' }), fetchedAt, 105,
      { priceIsLive: true, note: 'n' }, now,
    );
    expect(out.dataSource).toBe('fmp');
    expect(out.fetchedAt).toBe(fetchedAt.toISOString());
  });

  it('does not mutate the cached payload object', () => {
    const cached = payload();
    recombineCachedFundamentals(
      cached, new Date(now - 3 * DAY), 110,
      { priceIsLive: true, note: 'n' }, now,
    );
    expect(cached.price).toBe(100);
    expect(cached.multibaggerSignals!.week52High).toBe(150);
    expect(cached.appliedAdjustments).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Cache-hit path: cached fundamentals + cheap live price, no full fetch
// ---------------------------------------------------------------------------
describe('getStockData — persistent cache hit (age < 7 days)', () => {
  it('serves cached fundamentals with a fresh price and never touches the adapters', async () => {
    const cached = payload({ symbol: 'HIT1' });
    const row = cacheRow(cached, 2 * HOUR);
    vi.mocked(storage.getFundamentalsCache).mockResolvedValue(row);
    vi.mocked(getQuickPrice).mockResolvedValue(110);

    const res = await getStockData('HIT1');

    expect(res.price).toBe(110);
    expect(res.eps).toBe(5);
    expect(res.peRatio).toBe(22);
    expect(res.dataSource).toBe('yfinance');
    expect(res.fetchedAt).toBe(row.fetchedAt.toISOString());
    expect(res.appliedAdjustments!.join(' ')).toContain('Fundamentals served from cache');
    // 2h-old range is still within its 1-day tier.
    expect(res.multibaggerSignals!.week52High).toBe(150);

    expect(getYahooFinanceData).not.toHaveBeenCalled();
    expect(getRapidApiStockData).not.toHaveBeenCalled();
    expect(getAlphaVantageData).not.toHaveBeenCalled();
    expect(getFmpData).not.toHaveBeenCalled();
    expect(scrapeStockData).not.toHaveBeenCalled();
    expect(storage.upsertFundamentalsCache).not.toHaveBeenCalled();
  });

  it('drops the 52-week range on a hit older than 1 day', async () => {
    vi.mocked(storage.getFundamentalsCache).mockResolvedValue(cacheRow(payload({ symbol: 'HIT2' }), 3 * DAY));
    vi.mocked(getQuickPrice).mockResolvedValue(100);

    const res = await getStockData('HIT2');
    expect(res.multibaggerSignals!.week52High).toBeNull();
    expect(res.multibaggerSignals!.week52Low).toBeNull();
    expect(res.eps).toBe(5); // fundamentals still served
  });

  it('falls through to the live chain when the quick price fetch fails', async () => {
    vi.mocked(storage.getFundamentalsCache).mockResolvedValue(cacheRow(payload({ symbol: 'HIT3' }), 2 * HOUR));
    vi.mocked(getQuickPrice).mockRejectedValue(new Error('yahoo down'));
    vi.mocked(getYahooFinanceData).mockResolvedValue(payload({ symbol: 'HIT3', price: 123 }));

    const res = await getStockData('HIT3');
    expect(res.price).toBe(123);
    expect(res.dataSource).toBe('yfinance');
    expect(getYahooFinanceData).toHaveBeenCalled();
    // Fresh live payload is written back through to the cache.
    expect(storage.upsertFundamentalsCache).toHaveBeenCalled();
  });

  it('serves a stale row (7–14 days) immediately via stale-while-revalidate', async () => {
    vi.mocked(storage.getFundamentalsCache).mockResolvedValue(cacheRow(payload({ symbol: 'SWR1' }), 8 * DAY));
    vi.mocked(getQuickPrice).mockResolvedValue(111);
    vi.mocked(getYahooFinanceData).mockResolvedValue(payload({ symbol: 'SWR1', price: 90 }));

    const res = await getStockData('SWR1');
    // Stale fundamentals served immediately with a fresh live price
    expect(res.price).toBe(111);
    expect(res.eps).toBe(5);
    expect(res.appliedAdjustments?.some((n) => n.includes('background refresh'))).toBe(true);
    // Background refresh hits the live chain and writes back through
    await __awaitPendingSpotChecks();
    expect(getYahooFinanceData).toHaveBeenCalled();
    expect(storage.upsertFundamentalsCache).toHaveBeenCalled();
  });

  it('ignores an expired cache row (age > 14 days) and uses the live chain', async () => {
    vi.mocked(storage.getFundamentalsCache).mockResolvedValue(cacheRow(payload({ symbol: 'EXP1' }), 15 * DAY));
    vi.mocked(getYahooFinanceData).mockResolvedValue(payload({ symbol: 'EXP1', price: 90 }));

    const res = await getStockData('EXP1');
    expect(getQuickPrice).not.toHaveBeenCalled();
    expect(res.price).toBe(90);
    expect(storage.upsertFundamentalsCache).toHaveBeenCalled();
  });

  it('ignores a cached error payload and uses the live chain', async () => {
    const errPayload = payload({ symbol: 'ERR1', error: true } as Partial<StockResponse>);
    vi.mocked(storage.getFundamentalsCache).mockResolvedValue(cacheRow(errPayload, 1 * HOUR));
    vi.mocked(getYahooFinanceData).mockResolvedValue(payload({ symbol: 'ERR1', price: 77 }));

    const res = await getStockData('ERR1');
    expect(getQuickPrice).not.toHaveBeenCalled();
    expect(res.price).toBe(77);
  });

  it('survives a storage lookup failure and uses the live chain', async () => {
    vi.mocked(storage.getFundamentalsCache).mockRejectedValue(new Error('db down'));
    vi.mocked(getYahooFinanceData).mockResolvedValue(payload({ symbol: 'DBF1', price: 55 }));

    const res = await getStockData('DBF1');
    expect(res.price).toBe(55);
    expect(res.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Write-through: complete live payloads are persisted, static fallback is not
// ---------------------------------------------------------------------------
describe('getStockData — cache write-through', () => {
  it('persists a complete yfinance payload with its provenance', async () => {
    vi.mocked(getYahooFinanceData).mockResolvedValue(payload({ symbol: 'WT1' }));

    await getStockData('WT1');

    expect(storage.upsertFundamentalsCache).toHaveBeenCalledTimes(1);
    const [sym, persisted, source, fetchedAt] = vi.mocked(storage.upsertFundamentalsCache).mock.calls[0];
    expect(sym).toBe('WT1');
    expect((persisted as StockResponse).dataSource).toBe('yfinance');
    expect(source).toBe('yfinance');
    expect(fetchedAt).toBeInstanceOf(Date);
  });

  it('persists payloads from lower live tiers too (FMP)', async () => {
    vi.mocked(getFmpData).mockResolvedValue(payload({ symbol: 'WT2' }));

    await getStockData('WT2');
    expect(storage.upsertFundamentalsCache).toHaveBeenCalledTimes(1);
    expect(vi.mocked(storage.upsertFundamentalsCache).mock.calls[0][2]).toBe('fmp');
  });

  it('never persists the static fallback dataset', async () => {
    vi.mocked(getFallbackStockData).mockReturnValue(payload({ symbol: 'WT3' }));

    const res = await getStockData('WT3');
    expect(res.dataSource).toBe('fallback');
    expect(storage.upsertFundamentalsCache).not.toHaveBeenCalled();
  });

  it('a failing upsert never breaks the response', async () => {
    vi.mocked(getYahooFinanceData).mockResolvedValue(payload({ symbol: 'WT4' }));
    vi.mocked(storage.upsertFundamentalsCache).mockRejectedValue(new Error('disk full'));

    const res = await getStockData('WT4');
    expect(res.error).toBeUndefined();
    expect(res.dataSource).toBe('yfinance');
  });
});

// ---------------------------------------------------------------------------
// Stale-serve: every live source failed → old cached fundamentals beat the
// static dataset, with honest freshness and explicit notes
// ---------------------------------------------------------------------------
describe('getStockData — stale cache serve on total live failure', () => {
  it('serves stale cached fundamentals ahead of the static fallback', async () => {
    const row = cacheRow(payload({ symbol: 'STALE1' }), 20 * DAY);
    vi.mocked(storage.getFundamentalsCache).mockResolvedValue(row);
    vi.mocked(getFallbackStockData).mockReturnValue(payload({ symbol: 'STALE1', eps: 999 }));

    const res = await getStockData('STALE1');

    expect(res.eps).toBe(5); // cached, not the static dataset's 999
    expect(res.error).toBeUndefined();
    expect(res.dataSource).toBe('yfinance');
    expect(res.fetchedAt).toBe(row.fetchedAt.toISOString());
    expect(res.appliedAdjustments!.join(' ')).toContain('All live sources failed');
    // 20 days: range gone (1-day tier), peHistory kept (30-day tier).
    expect(res.multibaggerSignals!.week52High).toBeNull();
    expect(res.peHistory).toEqual({ fiveYearAvg: 18, tenYearAvg: 16, industryAvg: 21 });
    expect(getFallbackStockData).not.toHaveBeenCalled();
  });

  it('patches the stale payload with the best partial live price', async () => {
    // yfinance returns a price but no earnings → incomplete, but the price
    // is remembered and must patch the stale cached payload.
    vi.mocked(getYahooFinanceData).mockResolvedValue(payload({
      symbol: 'STALE2', price: 120, eps: 0, peRatio: 0, fcfPerShare: 0, growthRate: 0, revenueGrowth: 0, roe: 0,
    }));
    vi.mocked(storage.getFundamentalsCache).mockResolvedValue(cacheRow(payload({ symbol: 'STALE2' }), 10 * DAY));

    const res = await getStockData('STALE2');
    expect(res.price).toBe(120);
    expect(res.peRatio).toBe(24); // 120 / cached eps 5
    expect(res.eps).toBe(5);
  });

  it('drops peHistory when the stale copy is older than 30 days', async () => {
    vi.mocked(storage.getFundamentalsCache).mockResolvedValue(cacheRow(payload({ symbol: 'STALE3' }), 40 * DAY));

    const res = await getStockData('STALE3');
    expect(res.peHistory).toBeNull();
    expect(res.eps).toBe(5);
  });

  it('still uses the static fallback when there is no cached row', async () => {
    vi.mocked(getFallbackStockData).mockReturnValue(payload({ symbol: 'NOCACHE' }));

    const res = await getStockData('NOCACHE');
    expect(res.dataSource).toBe('fallback');
    expect(getFallbackStockData).toHaveBeenCalled();
  });

  it('still returns the error response when there is no cache and no fallback', async () => {
    const res = await getStockData('NADA');
    expect(res.error).toBe(true);
    expect(res.dataSource).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Tier constants — lock in the documented windows
// ---------------------------------------------------------------------------
describe('cache tier constants', () => {
  it('match the documented 7-day / 1-day / 30-day windows', () => {
    expect(FUNDAMENTALS_TTL_MS).toBe(7 * DAY);
    expect(RANGE_TTL_MS).toBe(1 * DAY);
    expect(PE_HISTORY_TTL_MS).toBe(30 * DAY);
  });
});
