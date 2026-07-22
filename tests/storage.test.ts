import { describe, it, expect, beforeEach, vi } from 'vitest';

// `server/storage.ts` initialises a `SafeStorageWrapper` at module-load time
// which (in production) reaches for the database. To keep these tests
// hermetic but still exercise the *real* MemStorage class shipped in
// production, we mock `./db` to be `null`. The SafeStorageWrapper then
// falls through to `MemStorage`, which is the code path under test.
vi.mock('../server/db', () => ({ db: null, pool: null }));

import { MemStorage } from '../server/storage';
import type { InsertFeedback, StockResponse } from '../shared/schema';

function fb(satisfaction: InsertFeedback['satisfaction'], extras: Partial<InsertFeedback> = {}): InsertFeedback {
  return {
    satisfaction,
    feedbackText: extras.feedbackText ?? 'test',
    benefitDescription: extras.benefitDescription ?? null,
    improvementSuggestion: extras.improvementSuggestion ?? null,
    userType: extras.userType ?? null,
    ...extras,
  } as InsertFeedback;
}

describe('MemStorage — feedback PMF math (production code path)', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('returns a zero-filled stats object when no feedback exists', async () => {
    const stats = await storage.getFeedbackStats();
    expect(stats).toEqual({
      totalResponses: 0,
      veryDisappointed: 0,
      somewhatDisappointed: 0,
      notDisappointed: 0,
      pmfScore: 0,
    });
  });

  it('computes the canonical 40% Sean Ellis PMF score', async () => {
    // 4 of 10 = 40% → the textbook Sean Ellis "you have PMF" threshold.
    for (let i = 0; i < 4; i++) await storage.createFeedback(fb('very_disappointed'));
    for (let i = 0; i < 4; i++) await storage.createFeedback(fb('somewhat_disappointed'));
    for (let i = 0; i < 2; i++) await storage.createFeedback(fb('not_disappointed'));

    const stats = await storage.getFeedbackStats();
    expect(stats.totalResponses).toBe(10);
    expect(stats.veryDisappointed).toBe(4);
    expect(stats.somewhatDisappointed).toBe(4);
    expect(stats.notDisappointed).toBe(2);
    expect(stats.pmfScore).toBeCloseTo(40, 5);
  });

  it('returns 100% when every respondent would be very disappointed', async () => {
    for (let i = 0; i < 3; i++) await storage.createFeedback(fb('very_disappointed'));
    const stats = await storage.getFeedbackStats();
    expect(stats.pmfScore).toBe(100);
  });

  it('returns 0% when no respondent would be very disappointed', async () => {
    await storage.createFeedback(fb('somewhat_disappointed'));
    await storage.createFeedback(fb('not_disappointed'));
    const stats = await storage.getFeedbackStats();
    expect(stats.pmfScore).toBe(0);
  });

  it('createFeedback assigns monotonically increasing ids', async () => {
    const a = await storage.createFeedback(fb('very_disappointed'));
    const b = await storage.createFeedback(fb('somewhat_disappointed'));
    expect(b.id).toBe(a.id + 1);
  });

  it('getAllFeedback returns entries sorted by createdAt', async () => {
    await storage.createFeedback(fb('very_disappointed'));
    await new Promise((r) => setTimeout(r, 5));
    await storage.createFeedback(fb('not_disappointed'));
    const all = await storage.getAllFeedback();
    expect(all).toHaveLength(2);
    const t0 = new Date(all[0].createdAt as any).getTime();
    const t1 = new Date(all[1].createdAt as any).getTime();
    expect(t0).toBeLessThanOrEqual(t1);
  });
});

describe('MemStorage — fundamentals cache (Task #58)', () => {
  let storage: MemStorage;

  const payload = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 200,
    eps: 6.5,
    peRatio: 30.77,
    fcfPerShare: 6,
    growthRate: 9,
    roe: 150,
    debtToEquity: 1.5,
    currentRatio: 1,
    revenueGrowth: 5,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    dataSource: 'yfinance',
    fetchedAt: new Date().toISOString(),
  } as StockResponse;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('returns undefined for a symbol that was never cached', async () => {
    expect(await storage.getFundamentalsCache('NVDA')).toBeUndefined();
  });

  it('upsert stores a row and get retrieves it, uppercasing the symbol', async () => {
    const fetchedAt = new Date('2026-07-20T12:00:00Z');
    await storage.upsertFundamentalsCache('aapl', payload, 'yfinance', fetchedAt);

    const row = await storage.getFundamentalsCache('AAPL');
    expect(row).toBeDefined();
    expect(row!.symbol).toBe('AAPL');
    expect(row!.dataSource).toBe('yfinance');
    expect(row!.fetchedAt).toEqual(fetchedAt);
    expect(row!.payload.eps).toBe(6.5);

    // Lookup is case-insensitive both ways.
    expect(await storage.getFundamentalsCache('aapl')).toBeDefined();
  });

  it('a second upsert overwrites the payload but keeps the same row id', async () => {
    const first = await storage.upsertFundamentalsCache('AAPL', payload, 'yfinance', new Date('2026-07-10T00:00:00Z'));
    const updated = { ...payload, eps: 7.1 } as StockResponse;
    const second = await storage.upsertFundamentalsCache('AAPL', updated, 'fmp', new Date('2026-07-21T00:00:00Z'));

    expect(second.id).toBe(first.id);
    const row = await storage.getFundamentalsCache('AAPL');
    expect(row!.payload.eps).toBe(7.1);
    expect(row!.dataSource).toBe('fmp');
    expect(row!.fetchedAt).toEqual(new Date('2026-07-21T00:00:00Z'));
  });

  it('rows for different symbols are independent', async () => {
    await storage.upsertFundamentalsCache('AAPL', payload, 'yfinance', new Date());
    await storage.upsertFundamentalsCache('MSFT', { ...payload, symbol: 'MSFT' } as StockResponse, 'fmp', new Date());
    const a = await storage.getFundamentalsCache('AAPL');
    const m = await storage.getFundamentalsCache('MSFT');
    expect(a!.id).not.toBe(m!.id);
    expect(a!.payload.symbol).toBe('AAPL');
    expect(m!.payload.symbol).toBe('MSFT');
  });
});
