import { describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({ db: null, pool: null }));

import { evaluate, isSp500DailyCheckDue, mergeMembershipChanges, normalizeSp500Changes, quarterForDate } from "../server/services/sp500Changes";
import { estimateIntrinsicValue } from "../server/services/researchScan";

describe("S&P 500 change normalization", () => {
  it("splits an FMP replacement row into an addition and deletion", () => {
    const rows = normalizeSp500Changes([{
      date: "2026-09-21",
      symbol: "BE",
      addedSecurity: "Bloom Energy",
      removedTicker: "TAP",
      removedSecurity: "Molson Coors Beverage",
    }]);
    expect(rows).toEqual([
      expect.objectContaining({ changeType: "addition", symbol: "BE", effectiveDate: "2026-09-21" }),
      expect.objectContaining({ changeType: "deletion", symbol: "TAP", effectiveDate: "2026-09-21" }),
    ]);
  });

  it("fills the missing FMP removal ticker from the complete release-mirror pair", () => {
    // Production FMP shape: symbol is the addition; removedSecurity is only a
    // company name and cannot safely be treated as a ticker.
    const fmp = normalizeSp500Changes([{
      date: "2026-09-21",
      symbol: "BE",
      addedSecurity: "Bloom Energy",
      removedSecurity: "Molson Coors Beverage",
    }], "FMP");
    const mirror = normalizeSp500Changes([{
      effectiveDate: "2026-09-21",
      symbol: "BE",
      addedSecurity: "Bloom Energy",
      removedTicker: "TAP",
      removedSecurity: "Molson Coors Beverage",
    }], "S&P releases / History of Market");

    const merged = mergeMembershipChanges(fmp, mirror);
    expect(merged).toHaveLength(2);
    expect(merged).toEqual(expect.arrayContaining([
      expect.objectContaining({ changeType: "addition", symbol: "BE", membershipSource: "FMP" }),
      expect.objectContaining({ changeType: "deletion", symbol: "TAP", membershipSource: "S&P releases / History of Market" }),
    ]));
  });

  it("normalizes class-share dots and removes duplicate events", () => {
    const input = {
      effectiveDate: "2026-06-01",
      addedTicker: "brk.b",
      addedSecurity: "Berkshire Hathaway",
    };
    const rows = normalizeSp500Changes([input, input]);
    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe("BRK-B");
  });

  it("ignores malformed rows without dates or tickers", () => {
    expect(normalizeSp500Changes([{ symbol: "AAPL" }, { date: "2026-01-01" }, null])).toEqual([]);
  });

  it("groups effective dates into calendar quarters", () => {
    expect(quarterForDate("2026-01-01")).toBe("2026 Q1");
    expect(quarterForDate("2026-06-30")).toBe("2026 Q2");
    expect(quarterForDate("2026-09-21")).toBe("2026 Q3");
    expect(quarterForDate("2026-12-31")).toBe("2026 Q4");
  });
});

describe("S&P 500 daily refresh gate", () => {
  it("checks when there is no prior successful date", () => {
    expect(isSp500DailyCheckDue(undefined, "2026-09-06")).toBe(true);
  });

  it("does not check twice on the same calendar date", () => {
    expect(isSp500DailyCheckDue("2026-09-06", "2026-09-06")).toBe(false);
  });

  it("checks again on the next calendar date", () => {
    expect(isSp500DailyCheckDue("2026-09-06", "2026-09-07")).toBe(true);
  });
});

describe("S&P 500 valuation gate", () => {
  it("uses the same intrinsic-value calculation as the stock detail page", () => {
    const redditLike = {
      symbol: "RDDT",
      name: "Reddit, Inc.",
      price: 154.46,
      eps: 2.25,
      peRatio: 68.65,
      fcfPerShare: 3.7,
      growthRate: 20,
      roe: 35,
      debtToEquity: 0.4,
      currentRatio: 2,
      revenueGrowth: 25,
      earningsStability: "High",
      competitivePosition: "Strong",
    };

    const intrinsicValue = estimateIntrinsicValue(redditLike as any);
    const snapshot = evaluate(redditLike as any);

    // Reddit's market price is above the full calculator's average value;
    // it must not be promoted to a positive S&P buy-screen result.
    expect(intrinsicValue).toBeLessThan(redditLike.price);
    expect(snapshot.meetsBuyCriteria).toBe(false);
    expect(snapshot.reason).toContain("below estimated value");
  });
});