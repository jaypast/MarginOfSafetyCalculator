import { describe, it, expect, beforeEach, vi } from 'vitest';

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
} from '../server/services/researchScan';

const mockGetStockData = vi.mocked(getStockData);

beforeEach(() => {
  _resetScanStateForTests();
  vi.clearAllMocks();
});

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
