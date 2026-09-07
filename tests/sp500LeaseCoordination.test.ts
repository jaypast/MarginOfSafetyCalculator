import { describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getSp500SyncState: vi.fn(),
  acquireSp500RefreshLease: vi.fn(),
  getSp500RefreshLease: vi.fn(),
  renewSp500RefreshLease: vi.fn(),
  releaseSp500RefreshLease: vi.fn(),
  listSp500Changes: vi.fn(),
  listSp500EvaluationRevisions: vi.fn(),
  insertSp500Change: vi.fn(),
  insertSp500EvaluationRevision: vi.fn(),
  setSp500SyncState: vi.fn(),
}));

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/services/fmpFinance", () => ({ getHistoricalSp500Changes: vi.fn() }));
vi.mock("../server/services/stockData", () => ({ getStockData: vi.fn() }));

import { syncSp500Changes } from "../server/services/sp500Changes";

describe("S&P 500 cross-server lease coordination", () => {
  it("shares one database waiter among concurrent callers on the non-owning server", async () => {
    storage.getSp500SyncState
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        id: 1,
        key: "daily",
        lastCheckedDate: "2026-09-07",
        lastCheckedAt: new Date("2026-09-07T12:05:00Z"),
      });
    storage.acquireSp500RefreshLease.mockResolvedValue(false);
    storage.getSp500RefreshLease.mockResolvedValue(undefined);

    const now = new Date("2026-09-07T12:00:00Z");
    const results = await Promise.all([
      syncSp500Changes(false, now),
      syncSp500Changes(false, now),
      syncSp500Changes(false, now),
    ]);

    expect(results).toEqual([
      { newCount: 0, checked: false },
      { newCount: 0, checked: false },
      { newCount: 0, checked: false },
    ]);
    expect(storage.acquireSp500RefreshLease).toHaveBeenCalledTimes(1);
    expect(storage.getSp500RefreshLease).toHaveBeenCalledTimes(1);
    expect(storage.getSp500SyncState).toHaveBeenCalledTimes(2);
  });
});