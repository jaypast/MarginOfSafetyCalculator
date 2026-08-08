/**
 * Integration test: /api/stock/:symbol route deadline
 *
 * Proves that the route returns HTTP 504 with a JSON timeout body when the
 * stock-data waterfall never settles. Uses a real Express app + Node's built-in
 * http module — no supertest required.
 *
 * The STOCK_FETCH_DEADLINE_MS env var is set to 80 ms so the test completes
 * quickly without waiting for the production 25-second deadline.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';

// Set the deadline short BEFORE any module that reads it is imported.
process.env.STOCK_FETCH_DEADLINE_MS = '80';

// Mock every service that registerRoutes depends on so the test is hermetic.
vi.mock('../server/services/stockData', () => ({
  getStockData: () => new Promise<never>(() => { /* intentionally never resolves */ }),
  acquireYfinanceSlot: vi.fn(),
  releaseYfinanceSlot: vi.fn(),
}));
vi.mock('../server/services/fmpFinance', () => ({ getInsiderTrades: vi.fn() }));
vi.mock('../server/services/fedRate', () => ({ getFedRateEnvironment: vi.fn() }));
vi.mock('../server/services/researchScan', () => ({
  getScanState: vi.fn(),
  startScanIfNeeded: vi.fn(),
}));
vi.mock('../server/services/marketSentiment', () => ({
  getMarketSentiment: vi.fn(),
  getMostActiveStocks: vi.fn(),
}));
vi.mock('../server/services/yahooFinance', () => ({
  getHistoricalData: vi.fn().mockRejectedValue(new Error('mocked')),
}));
vi.mock('../server/services/rapidApiFinance', () => ({
  getRapidApiHistoricalData: vi.fn().mockRejectedValue(new Error('mocked')),
}));
vi.mock('../server/services/webScraper', () => ({
  scrapeHistoricalData: vi.fn().mockRejectedValue(new Error('mocked')),
  getQuickPrice: vi.fn().mockRejectedValue(new Error('mocked')),
}));
vi.mock('../server/services/fallbackData', () => ({
  getFallbackHistoricalData: vi.fn().mockReturnValue(null),
  getFallbackStockData: vi.fn().mockReturnValue(null),
}));
vi.mock('../server/storage', () => ({
  storage: {
    getFundamentalsCache: vi.fn().mockResolvedValue(null),
    listWatchlistEntries: vi.fn().mockResolvedValue([]),
    getInsiderCache: vi.fn().mockResolvedValue(null),
    upsertInsiderCache: vi.fn().mockResolvedValue(undefined),
  },
}));

let server: http.Server;
let port: number;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  // Dynamically import so the mocks above are already in place.
  const { registerRoutes } = await import('../server/routes');
  server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as any).port;
});

afterAll(() => {
  server?.close();
});

/** Minimal helper — makes a GET request and resolves with the full response. */
function httpGet(path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: raw });
        }
      });
    });
    req.on('error', reject);
  });
}

describe('/api/stock/:symbol route deadline', () => {
  it('returns HTTP 504 with a timeout body when the waterfall never settles', async () => {
    const { status, body } = await httpGet('/api/stock/AAPL');
    expect(status).toBe(504);
    expect(body).toMatchObject({ error: 'timeout' });
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  }, 5_000 /* generous test timeout; actual wait is ~80 ms */);
});
