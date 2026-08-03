import { describe, it, expect } from 'vitest';
import {
  computeInsiderSignal,
  isCsuite,
  isOpenMarketPurchase,
  isOpenMarketSale,
  type InsiderTrade,
} from '../client/src/lib/insiderSignal';

// Helper: create a trade dated N days ago
function trade(opts: {
  daysAgo: number;
  transactionType: string;
  typeOfOwner: string;
  reportingName: string;
  securitiesTransacted?: number;
  price?: number;
}): InsiderTrade {
  const d = new Date();
  d.setDate(d.getDate() - opts.daysAgo);
  return {
    reportingName: opts.reportingName,
    typeOfOwner: opts.typeOfOwner,
    transactionDate: d.toISOString().slice(0, 10),
    transactionType: opts.transactionType,
    securitiesTransacted: opts.securitiesTransacted ?? 10000,
    price: opts.price ?? 100,
  };
}

describe('isCsuite', () => {
  it('recognises FMP officer strings', () => {
    expect(isCsuite('officer: Chief Executive Officer')).toBe(true);
    expect(isCsuite('officer: Chief Financial Officer')).toBe(true);
    expect(isCsuite('officer: COO')).toBe(true);
    expect(isCsuite('officer: President')).toBe(true);
    expect(isCsuite('director')).toBe(false);
    expect(isCsuite('officer: Vice President of Sales')).toBe(false);
  });
});

describe('isOpenMarketPurchase / isOpenMarketSale', () => {
  it('handles FMP "P-Purchase" and "S-Sale"', () => {
    expect(isOpenMarketPurchase('P-Purchase')).toBe(true);
    expect(isOpenMarketPurchase('p-purchase')).toBe(true);
    expect(isOpenMarketPurchase('P')).toBe(true);
    expect(isOpenMarketPurchase('A-Award')).toBe(false);
    expect(isOpenMarketSale('S-Sale')).toBe(true);
    expect(isOpenMarketSale('S')).toBe(true);
    expect(isOpenMarketSale('P-Purchase')).toBe(false);
  });
});

describe('computeInsiderSignal', () => {
  it('returns cluster-buy when ≥2 distinct C-suite buyers in 90 days', () => {
    const trades: InsiderTrade[] = [
      trade({ daysAgo: 10, transactionType: 'P-Purchase', typeOfOwner: 'officer: Chief Executive Officer', reportingName: 'Alice CEO' }),
      trade({ daysAgo: 20, transactionType: 'P-Purchase', typeOfOwner: 'officer: Chief Financial Officer', reportingName: 'Bob CFO' }),
    ];
    const sig = computeInsiderSignal(trades);
    expect(sig.tier).toBe('cluster-buy');
    expect(sig.summary).toMatch(/2 C-suite/);
  });

  it('does NOT cluster-buy when both purchases are same person', () => {
    const trades: InsiderTrade[] = [
      trade({ daysAgo: 10, transactionType: 'P-Purchase', typeOfOwner: 'officer: Chief Executive Officer', reportingName: 'Alice CEO' }),
      trade({ daysAgo: 20, transactionType: 'P-Purchase', typeOfOwner: 'officer: Chief Executive Officer', reportingName: 'Alice CEO' }),
    ];
    const sig = computeInsiderSignal(trades);
    // Only one distinct buyer — falls through to recent-buy check
    expect(sig.tier).not.toBe('cluster-buy');
  });

  it('returns cluster-buy gate failure when buyers are not C-suite', () => {
    const trades: InsiderTrade[] = [
      trade({ daysAgo: 10, transactionType: 'P-Purchase', typeOfOwner: 'director', reportingName: 'Alice Dir' }),
      trade({ daysAgo: 20, transactionType: 'P-Purchase', typeOfOwner: 'director', reportingName: 'Bob Dir' }),
    ];
    const sig = computeInsiderSignal(trades);
    // 2 distinct buyers but neither is C-suite — no cluster-buy
    expect(sig.tier).not.toBe('cluster-buy');
    // Both are $100 × 10,000 = $1M → triggers recent-buy
    expect(sig.tier).toBe('recent-buy');
  });

  it('returns recent-buy for a single large open-market purchase ≥ $50K', () => {
    const trades: InsiderTrade[] = [
      trade({ daysAgo: 30, transactionType: 'P-Purchase', typeOfOwner: 'director', reportingName: 'Dave Dir', securitiesTransacted: 1000, price: 60 }),
    ];
    const sig = computeInsiderSignal(trades);
    expect(sig.tier).toBe('recent-buy');
    expect(sig.summary).toMatch(/Dave Dir/);
  });

  it('returns no-signal when there are no trades', () => {
    const sig = computeInsiderSignal([]);
    expect(sig.tier).toBe('no-signal');
    expect(sig.recentTrades).toHaveLength(0);
  });

  it('returns sell-only when only sales exist in 90 days', () => {
    const trades: InsiderTrade[] = [
      trade({ daysAgo: 15, transactionType: 'S-Sale', typeOfOwner: 'officer: Chief Executive Officer', reportingName: 'Alice CEO' }),
      trade({ daysAgo: 45, transactionType: 'S-Sale', typeOfOwner: 'officer: CFO', reportingName: 'Bob CFO' }),
    ];
    const sig = computeInsiderSignal(trades);
    expect(sig.tier).toBe('sell-only');
  });

  it('ignores purchases older than 90 days for tier calculation', () => {
    const trades: InsiderTrade[] = [
      // Old C-suite purchase — outside window
      trade({ daysAgo: 100, transactionType: 'P-Purchase', typeOfOwner: 'officer: Chief Executive Officer', reportingName: 'Alice CEO' }),
      trade({ daysAgo: 110, transactionType: 'P-Purchase', typeOfOwner: 'officer: CFO', reportingName: 'Bob CFO' }),
      // Recent sale — inside window
      trade({ daysAgo: 5, transactionType: 'S-Sale', typeOfOwner: 'director', reportingName: 'Charlie Dir' }),
    ];
    const sig = computeInsiderSignal(trades);
    // Old C-suite buys ignored → sells only in window → sell-only
    expect(sig.tier).toBe('sell-only');
  });

  it('returns up to 5 recent trades regardless of tier', () => {
    const trades = Array.from({ length: 8 }, (_, i) =>
      trade({ daysAgo: i + 1, transactionType: 'S-Sale', typeOfOwner: 'director', reportingName: `Dir${i}` })
    );
    const sig = computeInsiderSignal(trades);
    expect(sig.recentTrades.length).toBeLessThanOrEqual(5);
  });

  it('mixed buy+sell: cluster buy wins over sell-only', () => {
    const trades: InsiderTrade[] = [
      trade({ daysAgo: 5, transactionType: 'P-Purchase', typeOfOwner: 'officer: Chief Executive Officer', reportingName: 'Alice CEO' }),
      trade({ daysAgo: 10, transactionType: 'P-Purchase', typeOfOwner: 'officer: CFO', reportingName: 'Bob CFO' }),
      trade({ daysAgo: 15, transactionType: 'S-Sale', typeOfOwner: 'director', reportingName: 'Charlie Dir', securitiesTransacted: 50000 }),
    ];
    const sig = computeInsiderSignal(trades);
    expect(sig.tier).toBe('cluster-buy');
  });
});
