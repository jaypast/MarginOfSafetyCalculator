import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'http';
import type { InsiderTrade } from '../shared/schema';

vi.mock('../server/services/stockData', () => ({
  getStockData: vi.fn(),
  acquireYfinanceSlot: vi.fn(),
  releaseYfinanceSlot: vi.fn(),
}));
vi.mock('../server/services/fmpFinance', () => ({ getInsiderTrades: vi.fn() }));
vi.mock('../server/services/fedRate', () => ({ getFedRateEnvironment: vi.fn() }));
vi.mock('../server/services/researchScan', () => ({
  getScanState: vi.fn(),
  startScanIfNeeded: vi.fn(),
}));
vi.mock('../server/services/sp500Changes', () => ({
  getSp500ChangesResponse: vi.fn(),
  syncSp500Changes: vi.fn(),
}));
vi.mock('../server/services/marketSentiment', () => ({
  getMarketSentiment: vi.fn(),
  getMostActiveStocks: vi.fn(),
}));
vi.mock('../server/services/yahooFinance', () => ({ getHistoricalData: vi.fn() }));
vi.mock('../server/services/rapidApiFinance', () => ({ getRapidApiHistoricalData: vi.fn() }));
vi.mock('../server/services/webScraper', () => ({ scrapeHistoricalData: vi.fn() }));
vi.mock('../server/services/fallbackData', () => ({ getFallbackHistoricalData: vi.fn() }));
vi.mock('../server/storage', () => ({
  storage: {
    getInsiderCache: vi.fn(),
    upsertInsiderCache: vi.fn(),
  },
}));

import { getInsiderTrades } from '../server/services/fmpFinance';
import { storage } from '../server/storage';

const trades: InsiderTrade[] = [{
  reportingName: 'Jane Director',
  typeOfOwner: 'director',
  transactionDate: '2026-09-05',
  transactionType: 'P-Purchase',
  securitiesTransacted: 1250,
  price: 42.5,
}];

let server: http.Server;
let port: number;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  const { registerRoutes } = await import('../server/routes');
  server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as any).port;
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(storage.getInsiderCache).mockResolvedValue(undefined);
  vi.mocked(storage.upsertInsiderCache).mockResolvedValue({} as any);
  vi.mocked(getInsiderTrades).mockResolvedValue(trades);
});

function httpGet(path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: JSON.parse(raw),
        });
      });
    });
    req.on('error', reject);
  });
}

describe('GET /api/insider/:symbol', () => {
  it('returns a cache hit younger than 24 hours without calling FMP', async () => {
    const fetchedAt = new Date(Date.now() - 60 * 60 * 1000);
    vi.mocked(storage.getInsiderCache).mockResolvedValue({
      id: 1,
      symbol: 'AAPL',
      payload: trades,
      fetchedAt,
    });

    const response = await httpGet('/api/insider/aapl');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ trades, cachedAt: fetchedAt.toISOString() });
    expect(getInsiderTrades).not.toHaveBeenCalled();
    expect(storage.upsertInsiderCache).not.toHaveBeenCalled();
  });

  it('fetches, caches, and returns fresh trades on a cache miss', async () => {
    const response = await httpGet('/api/insider/msft');

    expect(response.status).toBe(200);
    expect(response.body.trades).toEqual(trades);
    expect(getInsiderTrades).toHaveBeenCalledWith('MSFT');
    expect(storage.upsertInsiderCache).toHaveBeenCalledWith(
      'MSFT',
      trades,
      expect.any(Date),
    );
  });

  it('returns an empty trade list rather than 500 when FMP is unavailable', async () => {
    vi.mocked(getInsiderTrades).mockResolvedValue([]);

    const response = await httpGet('/api/insider/nada');

    expect(response.status).toBe(200);
    expect(response.body.trades).toEqual([]);
  });

  it('returns fresh FMP trades when the fire-and-forget cache write fails', async () => {
    vi.mocked(storage.upsertInsiderCache).mockRejectedValue(new Error('relation does not exist'));

    const response = await httpGet('/api/insider/tsla');

    expect(response.status).toBe(200);
    expect(response.body.trades).toEqual(trades);
    expect(storage.upsertInsiderCache).toHaveBeenCalledOnce();
  });

  it('logs a cache read failure and still returns fresh FMP trades', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(storage.getInsiderCache).mockRejectedValue(new Error('relation "insider_cache" does not exist'));

    const response = await httpGet('/api/insider/nvda');

    expect(response.status).toBe(200);
    expect(response.body.trades).toEqual(trades);
    expect(getInsiderTrades).toHaveBeenCalledWith('NVDA');
    expect(warning).toHaveBeenCalledWith(
      'insider cache read failed for NVDA:',
      'relation "insider_cache" does not exist',
    );
    warning.mockRestore();
  });
});