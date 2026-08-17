import { describe, it, expect, beforeEach, vi } from 'vitest';

// `server/storage.ts` initialises a `SafeStorageWrapper` at module-load time
// which (in production) reaches for the database. We mock `./db` to be `null`
// so the SafeStorageWrapper falls through to `MemStorage`, which is the code
// path under test here. Same pattern as `tests/storage.test.ts`.
vi.mock('../server/db', () => ({ db: null, pool: null }));

import { MemStorage } from '../server/storage';
import {
  classifyBuyZone,
  priceVsBuyBelowPct,
} from '../client/src/lib/watchlist';
import {
  createWatchlistStockQuery,
  refreshWatchlistStockQueries,
} from '../client/src/pages/Watchlist';

describe('MemStorage — watchlist CRUD (production code path)', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('starts empty for a brand-new session', async () => {
    const entries = await storage.listWatchlistEntries('session-A');
    expect(entries).toEqual([]);
  });

  it('persists added entries and returns them in insertion order', async () => {
    await storage.addWatchlistEntry('session-A', 'AAPL', 25);
    await storage.addWatchlistEntry('session-A', 'MSFT', 30);
    const entries = await storage.listWatchlistEntries('session-A');
    expect(entries).toHaveLength(2);
    expect(entries[0].symbol).toBe('AAPL');
    expect(entries[1].symbol).toBe('MSFT');
    expect(entries[0].marginOfSafety).toBe(25);
    expect(entries[1].marginOfSafety).toBe(30);
  });

  it('uppercases the symbol on insert so casing never causes duplicates', async () => {
    const entry = await storage.addWatchlistEntry('session-A', 'aapl', 25);
    expect(entry.symbol).toBe('AAPL');
  });

  it('dedupes (sessionId, symbol) and updates the MoS on re-add', async () => {
    const first = await storage.addWatchlistEntry('session-A', 'AAPL', 25);
    const second = await storage.addWatchlistEntry('session-A', 'aapl', 40);
    expect(second.id).toBe(first.id);
    const entries = await storage.listWatchlistEntries('session-A');
    expect(entries).toHaveLength(1);
    expect(entries[0].marginOfSafety).toBe(40);
  });

  it('scopes entries by sessionId — sessions cannot see each other', async () => {
    await storage.addWatchlistEntry('session-A', 'AAPL', 25);
    await storage.addWatchlistEntry('session-B', 'TSLA', 35);

    const a = await storage.listWatchlistEntries('session-A');
    const b = await storage.listWatchlistEntries('session-B');

    expect(a.map(e => e.symbol)).toEqual(['AAPL']);
    expect(b.map(e => e.symbol)).toEqual(['TSLA']);
  });

  it('removeWatchlistEntry returns true when a row is deleted', async () => {
    const entry = await storage.addWatchlistEntry('session-A', 'AAPL', 25);
    const removed = await storage.removeWatchlistEntry(entry.id, 'session-A');
    expect(removed).toBe(true);
    const after = await storage.listWatchlistEntries('session-A');
    expect(after).toHaveLength(0);
  });

  it('removeWatchlistEntry returns false for a foreign sessionId (no cross-session deletes)', async () => {
    const entry = await storage.addWatchlistEntry('session-A', 'AAPL', 25);
    const removed = await storage.removeWatchlistEntry(entry.id, 'session-B');
    expect(removed).toBe(false);
    // Still present for the original owner.
    const after = await storage.listWatchlistEntries('session-A');
    expect(after).toHaveLength(1);
  });

  it('removeWatchlistEntry returns false for an unknown id', async () => {
    const removed = await storage.removeWatchlistEntry(9999, 'session-A');
    expect(removed).toBe(false);
  });

  it('createdAt is populated for every entry', async () => {
    const entry = await storage.addWatchlistEntry('session-A', 'AAPL', 25);
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(Number.isFinite(entry.createdAt.getTime())).toBe(true);
  });
});

describe('classifyBuyZone — color-coding logic for the watchlist UI', () => {
  it('returns "buy" when price equals the threshold (boundary case)', () => {
    expect(classifyBuyZone(100, 100)).toBe('buy');
  });

  it('returns "buy" when price is below the threshold', () => {
    expect(classifyBuyZone(80, 100)).toBe('buy');
  });

  it('returns "near" when price is within 10% above the threshold', () => {
    // 5% above
    expect(classifyBuyZone(105, 100)).toBe('near');
    // exactly 10% above is still "near" (inclusive boundary)
    expect(classifyBuyZone(110, 100)).toBe('near');
  });

  it('returns "neutral" when price is more than 10% above the threshold', () => {
    expect(classifyBuyZone(110.01, 100)).toBe('neutral');
    expect(classifyBuyZone(150, 100)).toBe('neutral');
  });

  it('returns "neutral" for non-positive or non-finite inputs', () => {
    expect(classifyBuyZone(100, 0)).toBe('neutral');
    expect(classifyBuyZone(100, -5)).toBe('neutral');
    expect(classifyBuyZone(0, 100)).toBe('neutral');
    expect(classifyBuyZone(NaN, 100)).toBe('neutral');
    expect(classifyBuyZone(100, NaN)).toBe('neutral');
    expect(classifyBuyZone(100, Infinity)).toBe('neutral');
  });
});

describe('priceVsBuyBelowPct — headroom vs the buy-below threshold', () => {
  it('returns negative percent when price is below the threshold', () => {
    expect(priceVsBuyBelowPct(80, 100)).toBeCloseTo(-20, 5);
  });

  it('returns 0 when price equals the threshold', () => {
    expect(priceVsBuyBelowPct(100, 100)).toBe(0);
  });

  it('returns positive percent when price is above the threshold', () => {
    expect(priceVsBuyBelowPct(120, 100)).toBeCloseTo(20, 5);
  });

  it('returns null for invalid thresholds', () => {
    expect(priceVsBuyBelowPct(100, 0)).toBeNull();
    expect(priceVsBuyBelowPct(100, -5)).toBeNull();
    expect(priceVsBuyBelowPct(NaN, 100)).toBeNull();
  });
});

describe('watchlist refresh policy', () => {
  const entry = {
    id: 1,
    sessionId: 'session-A',
    symbol: 'AAPL',
    marginOfSafety: 25,
    createdAt: new Date(),
  };

  it('does not enable stock requests when the watchlist page mounts', () => {
    const query = createWatchlistStockQuery(entry);
    expect(query.queryKey).toEqual(['/api/stock', 'AAPL']);
    expect(query.enabled).toBe(false);
  });

  it('refetches every row only when the refresh action calls it', async () => {
    const refetchA = vi.fn().mockResolvedValue({ isError: false });
    const refetchB = vi.fn().mockResolvedValue({ isError: true });

    const incomplete = await refreshWatchlistStockQueries([
      { refetch: refetchA },
      { refetch: refetchB },
    ]);

    expect(refetchA).toHaveBeenCalledOnce();
    expect(refetchB).toHaveBeenCalledOnce();
    expect(incomplete).toBe(true);
  });
});
