import { describe, it, expect } from 'vitest';
import { computeVmsScore, computeSectorWarning } from '../client/src/lib/vmsScore';
import type { StockData } from '../client/src/lib/types';

// Minimal StockData stub — only the fields needed for VMS scoring.
function makeStock(overrides: Partial<StockData> = {}): StockData {
  return {
    symbol: 'TEST',
    name: 'Test Corp',
    price: 100,
    eps: 5,
    peRatio: 20,
    fcfPerShare: 4,
    growthRate: 10,
    roe: 20,
    debtToEquity: 0.3,
    currentRatio: 2,
    revenueGrowth: 10,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    grossMargin: 0.75,
    operatingMargin: 0.25,
    ...overrides,
  };
}

describe('computeVmsScore', () => {
  it('scores a classic VMS-Like business at ≥75', () => {
    const stock = makeStock({
      grossMargin: 0.80,       // +30
      operatingMargin: 0.30,   // +20
      fcfPerShare: 5,          // +20 (combined with earningsStability High)
      earningsStability: 'High',
      debtToEquity: 0.2,       // +15
      revenueGrowth: 12,       // +15
    });
    const result = computeVmsScore(stock);
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.tier).toBe('VMS-Like');
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('scores a capital-heavy industrial as Asset-Heavy', () => {
    const stock = makeStock({
      grossMargin: 0.20,       // no points
      operatingMargin: 0.05,   // no points
      fcfPerShare: 1,          // earningsStability Low → no points
      earningsStability: 'Low',
      debtToEquity: 2.5,       // no points (≥0.5)
      revenueGrowth: 3,        // no points (< 5)
    });
    const result = computeVmsScore(stock);
    expect(result.score).toBeLessThan(25);
    expect(result.tier).toBe('Asset-Heavy');
  });

  it('scores a high-growth SaaS with no FCF as Mixed or Software Characteristics', () => {
    const stock = makeStock({
      grossMargin: 0.72,       // +30
      operatingMargin: 0.08,   // no points (< 0.20)
      fcfPerShare: -1,         // no points (negative FCF)
      earningsStability: 'Medium',
      debtToEquity: 0.4,       // +15
      revenueGrowth: 35,       // no points (> 20)
    });
    const result = computeVmsScore(stock);
    expect(result.score).toBeGreaterThanOrEqual(25);
    expect(result.score).toBeLessThan(75);
    expect(['Mixed', 'Software Characteristics']).toContain(result.tier);
  });

  it('handles null / missing margin fields without crashing', () => {
    const stock = makeStock({
      grossMargin: null,
      operatingMargin: null,
      fcfPerShare: 0,
      earningsStability: 'Medium',
      debtToEquity: 0.3,
      revenueGrowth: 10,
    });
    expect(() => computeVmsScore(stock)).not.toThrow();
    const result = computeVmsScore(stock);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['VMS-Like', 'Software Characteristics', 'Mixed', 'Asset-Heavy']).toContain(result.tier);
  });

  it('returns signals describing each positive indicator that fired', () => {
    const stock = makeStock({
      grossMargin: 0.80,
      operatingMargin: 0.25,
      fcfPerShare: 3,
      earningsStability: 'High',
      debtToEquity: 0.3,
      revenueGrowth: 12,
    });
    const result = computeVmsScore(stock);
    // Should have a signal for each of the 5 indicators that fired
    expect(result.signals.length).toBe(5);
  });

  it('does not award D/E points when D/E ≥ 0.5', () => {
    const withHighDebt = makeStock({ debtToEquity: 0.8 });
    const withLowDebt = makeStock({ debtToEquity: 0.3 });
    expect(computeVmsScore(withLowDebt).score).toBeGreaterThan(computeVmsScore(withHighDebt).score);
  });

  it('does not award revenue growth points for a decliner', () => {
    const decliner = makeStock({ revenueGrowth: -5 });
    const grower = makeStock({ revenueGrowth: 10 });
    expect(computeVmsScore(grower).score).toBeGreaterThan(computeVmsScore(decliner).score);
  });
});

describe('computeSectorWarning', () => {
  it('returns a green VMS-Like warning when vmsScore ≥ 75', () => {
    const stock = makeStock();
    const warning = computeSectorWarning(stock, 80);
    expect(warning).not.toBeNull();
    expect(warning!.variant).toBe('green');
    expect(warning!.title).toMatch(/Reliable DCF/i);
  });

  it('returns an amber warning for a binary-outcome business', () => {
    const stock = makeStock({
      eps: -1,
      fcfPerShare: -2,
      earningsStability: 'Low',
    });
    const warning = computeSectorWarning(stock, 10);
    expect(warning).not.toBeNull();
    expect(warning!.variant).toBe('amber');
    expect(warning!.title).toMatch(/Binary-Outcome/i);
  });

  it('returns an amber warning for high-growth platform with thin margins', () => {
    const stock = makeStock({
      growthRate: 40,
      grossMargin: 0.25,
      eps: 2,
      fcfPerShare: 1,
      earningsStability: 'Medium',
    });
    const warning = computeSectorWarning(stock, 20);
    expect(warning).not.toBeNull();
    expect(warning!.variant).toBe('amber');
    expect(warning!.title).toMatch(/High-Growth Platform/i);
  });

  it('returns null for a normal average business', () => {
    const stock = makeStock({
      grossMargin: 0.45,
      operatingMargin: 0.15,
      eps: 3,
      fcfPerShare: 2,
      earningsStability: 'Medium',
      growthRate: 8,
    });
    const warning = computeSectorWarning(stock, 40);
    expect(warning).toBeNull();
  });

  it('does not crash with undefined impliedGrowthRate', () => {
    const stock = makeStock();
    expect(() => computeSectorWarning(stock, 30, undefined)).not.toThrow();
    expect(() => computeSectorWarning(stock, 30, null)).not.toThrow();
  });
});
