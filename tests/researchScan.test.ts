import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../server/services/stockData', () => ({
  getStockData: vi.fn(),
}));

import { getStockData } from '../server/services/stockData';
import {
  getScanState,
  isScanCacheFresh,
  startScanIfNeeded,
  _resetScanStateForTests,
  _setCompletedForTests,
  PER_CALL_TIMEOUT_MS,
  MAX_SCAN_DURATION_MS,
  BETWEEN_CALL_DELAY_MS,
} from '../server/services/researchScan';

const mockGetStockData = vi.mocked(getStockData);

const ERROR_RESPONSE = { error: 'no data', price: 0, symbol: 'X', name: 'X' } as any;

beforeEach(() => {
  _resetScanStateForTests();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Original 12 tests
// ---------------------------------------------------------------------------

describe('getScanState — initial state after server restart', () => {
  it('returns status idle before any scan has been triggered', () => {
    const s = getScanState();
    expect(s.status).toBe('idle');
    expect(s.scanned).toBe(0);
    expect(s.found).toBe(0);
    expect(s.candidates).toEqual([]);
  });
});

describe('startScanIfNeeded — transitions to scanning', () => {
  it('sets status to scanning immediately after being called from idle', () => {
    mockGetStockData.mockReturnValue(new Promise(() => {}));

    startScanIfNeeded();

    const s = getScanState();
    expect(s.status).toBe('scanning');
    expect(s.startedAt).toBeDefined();
  });

  it('does not start a second scan if one is already in progress', () => {
    mockGetStockData.mockReturnValue(new Promise(() => {}));

    startScanIfNeeded();
    const firstStartedAt = getScanState().startedAt;

    startScanIfNeeded();

    expect(mockGetStockData).toHaveBeenCalledTimes(1);
    expect(getScanState().startedAt).toBe(firstStartedAt);
  });
});

describe('isScanCacheFresh — cache validity', () => {
  it('returns false before any scan has completed', () => {
    expect(isScanCacheFresh()).toBe(false);
  });

  it('returns true when a scan completed within the last 24 hours', () => {
    _setCompletedForTests(Date.now() - 60_000);
    expect(isScanCacheFresh()).toBe(true);
  });

  it('returns false when the last completed scan is older than 24 hours', () => {
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    _setCompletedForTests(twentyFiveHoursAgo);
    expect(isScanCacheFresh()).toBe(false);
  });

  it('returns true right at the 24h boundary (completedAt = now - 24h + 1ms)', () => {
    const justUnder24h = Date.now() - (24 * 60 * 60 * 1000 - 1);
    _setCompletedForTests(justUnder24h);
    expect(isScanCacheFresh()).toBe(true);
  });
});

describe('startScanIfNeeded — cache hit skips new scan', () => {
  it('does NOT start a new scan when results are fresh', () => {
    mockGetStockData.mockReturnValue(new Promise(() => {}));
    _setCompletedForTests(Date.now() - 60_000);

    startScanIfNeeded();

    expect(mockGetStockData).not.toHaveBeenCalled();
    expect(getScanState().status).toBe('done');
  });

  it('preserves the existing candidates when cache is fresh', () => {
    _setCompletedForTests(Date.now() - 60_000);
    const before = getScanState();

    startScanIfNeeded();

    const after = getScanState();
    expect(after.status).toBe('done');
    expect(after.found).toBe(before.found);
  });
});

describe('startScanIfNeeded — ?refresh=true resets cache and restarts', () => {
  it('triggers a fresh scan even when results are still fresh', () => {
    mockGetStockData.mockReturnValue(new Promise(() => {}));
    _setCompletedForTests(Date.now() - 60_000);

    startScanIfNeeded(true);

    expect(mockGetStockData).toHaveBeenCalled();
    expect(getScanState().status).toBe('scanning');
  });

  it('resets scanned / found counters on a forced refresh', () => {
    mockGetStockData.mockReturnValue(new Promise(() => {}));
    _setCompletedForTests(Date.now() - 60_000);

    startScanIfNeeded(true);

    const s = getScanState();
    expect(s.scanned).toBe(0);
    expect(s.found).toBe(0);
    expect(s.candidates).toEqual([]);
  });

  it('does NOT restart if a scan is already running, even with forceRefresh', () => {
    mockGetStockData.mockReturnValue(new Promise(() => {}));

    startScanIfNeeded();
    const callsAfterFirst = mockGetStockData.mock.calls.length;

    startScanIfNeeded(true);

    expect(mockGetStockData.mock.calls.length).toBe(callsAfterFirst);
    expect(getScanState().status).toBe('scanning');
  });
});

// ---------------------------------------------------------------------------
// New tests: per-call timeout, max scan duration, fallback data handling
// ---------------------------------------------------------------------------

describe('per-call timeout — hanging getStockData is aborted', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('scan completes even when every getStockData call hangs indefinitely', async () => {
    vi.useFakeTimers();

    mockGetStockData.mockImplementation(() => new Promise(() => {}));

    startScanIfNeeded();

    // Advance far past the wall-clock limit; the max-duration guard fires first
    await vi.advanceTimersByTimeAsync(MAX_SCAN_DURATION_MS + PER_CALL_TIMEOUT_MS * 2 + 5_000);

    expect(getScanState().status).toBe('done');
  });

  it('timed-out symbol is counted in scanned total and the loop continues', async () => {
    vi.useFakeTimers();

    mockGetStockData.mockImplementation(() => new Promise(() => {}));

    startScanIfNeeded();

    // Advance past one full timeout + inter-call delay cycle
    await vi.advanceTimersByTimeAsync(PER_CALL_TIMEOUT_MS + BETWEEN_CALL_DELAY_MS + 100);

    expect(getScanState().scanned).toBeGreaterThanOrEqual(1);

    // Drain the scan so afterEach starts clean
    await vi.advanceTimersByTimeAsync(MAX_SCAN_DURATION_MS + PER_CALL_TIMEOUT_MS * 2 + 5_000);
  });
});

describe('max scan duration guard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the scan done before exhausting the pool when the wall clock fires', async () => {
    vi.useFakeTimers();

    // Hangs forever → each symbol costs PER_CALL_TIMEOUT_MS + BETWEEN_CALL_DELAY_MS
    // At ~17s per symbol and a pool of ~44 symbols, MAX (~480s) is reached around
    // symbol #28, well before the pool is exhausted.
    mockGetStockData.mockImplementation(() => new Promise(() => {}));

    startScanIfNeeded();
    const { poolSize } = getScanState();

    await vi.advanceTimersByTimeAsync(MAX_SCAN_DURATION_MS + PER_CALL_TIMEOUT_MS * 2 + 5_000);

    const s = getScanState();
    expect(s.status).toBe('done');
    expect(s.scanned).toBeGreaterThan(0);
    expect(s.scanned).toBeLessThan(poolSize);
  });
});

describe('fallback data handling', () => {
  it('accepts fallback data that has valid quality metrics and qualifies as a candidate', async () => {
    const goodFallback = {
      symbol: 'MSFT', name: 'Microsoft', price: 100,
      eps: 10, peRatio: 25, fcfPerShare: 8, growthRate: 15,
      roe: 25, debtToEquity: 0.4, currentRatio: 2.0,
      dataSource: 'fallback', error: null,
    } as any;

    // First call resolves with qualifying fallback data; subsequent calls return
    // errors so the scan sleeps (2s) before reaching the next symbol.
    mockGetStockData.mockResolvedValueOnce(goodFallback);
    mockGetStockData.mockResolvedValue(ERROR_RESPONSE);

    startScanIfNeeded();
    // Allow the first async tick (getStockData resolves immediately) to settle
    await new Promise(r => setTimeout(r, 50));

    const s = getScanState();
    // Symbol was processed (not immediately skipped by the metrics guard)
    expect(s.scanned).toBeGreaterThanOrEqual(1);
    // And it qualified as a candidate (ROE=25, D/E=0.4, CR=2 → Exceptional, large discount)
    expect(s.found).toBeGreaterThanOrEqual(1);
  });

  it('skips fallback data whose quality metrics are all zero', async () => {
    const emptyFallback = {
      symbol: 'AAPL', name: 'Apple', price: 150,
      eps: 6, peRatio: 25, fcfPerShare: 0, growthRate: 10,
      roe: 0, debtToEquity: 0, currentRatio: 0,
      dataSource: 'fallback', error: null,
    } as any;

    mockGetStockData.mockResolvedValueOnce(emptyFallback);
    mockGetStockData.mockResolvedValue(ERROR_RESPONSE);

    startScanIfNeeded();
    await new Promise(r => setTimeout(r, 50));

    // Symbol processed but no candidate added (zero metrics → skipped)
    expect(getScanState().found).toBe(0);
  });
});
