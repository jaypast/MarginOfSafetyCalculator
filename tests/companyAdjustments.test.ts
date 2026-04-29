import { describe, it, expect } from 'vitest';
import {
  determineIndustry,
  getAdjustmentFactors,
  detectDataIssues,
  describeIndustry,
  industryAdjustments,
  companyIndustryMap,
} from '@/lib/companyAdjustments';
import type { StockData } from '@/lib/types';

function stock(overrides: Partial<StockData> = {}): StockData {
  return {
    symbol: 'XXX',
    name: 'Generic Co',
    price: 100,
    eps: 5,
    peRatio: 20,
    fcfPerShare: 4,
    growthRate: 10,
    roe: 15,
    debtToEquity: 0.5,
    currentRatio: 1.5,
    revenueGrowth: 8,
    earningsStability: 'Medium',
    competitivePosition: 'Good',
    ...overrides,
  };
}

describe('companyIndustryMap', () => {
  it('contains TSLA exactly once (no duplicate keys)', () => {
    // Object literals can't physically contain two of the same key, so we
    // mostly want to verify that TSLA is present and classified as
    // AUTO_MANUFACTURER (the documented intentional choice).
    expect(companyIndustryMap['TSLA']).toBe('AUTO_MANUFACTURER');
    // Sanity check the previously-conflicting symbols too.
    expect(companyIndustryMap['7203.T']).toBe('AUTO_MANUFACTURER');
    expect(companyIndustryMap['AAPL']).toBe('TECHNOLOGY');
  });

  it('every industry mentioned in the map exists in industryAdjustments', () => {
    for (const ind of Object.values(companyIndustryMap)) {
      expect(industryAdjustments[ind]).toBeDefined();
    }
  });
});

describe('determineIndustry', () => {
  it('uses direct lookup for known symbols', () => {
    expect(determineIndustry(stock({ symbol: 'AAPL' }))).toBe('TECHNOLOGY');
    expect(determineIndustry(stock({ symbol: 'JPM' }))).toBe('FINANCIAL');
  });

  it('detects auto manufacturers by name token', () => {
    expect(determineIndustry(stock({ symbol: 'NEW1', name: 'New Motor Corp' })))
      .toBe('AUTO_MANUFACTURER');
  });

  it('does NOT classify Nintendo (7974.T) as AUTO_MANUFACTURER (regression)', () => {
    // The old heuristic treated every 7xxx.T symbol as auto.
    expect(determineIndustry(stock({ symbol: '7974.T', name: 'Nintendo Co Ltd' })))
      .not.toBe('AUTO_MANUFACTURER');
  });

  it('does NOT classify Mitsubishi Heavy (7011.T) as AUTO_MANUFACTURER (regression)', () => {
    expect(determineIndustry(stock({ symbol: '7011.T', name: 'Mitsubishi Heavy Industries' })))
      .not.toBe('AUTO_MANUFACTURER');
  });

  it('detects financial companies by name token', () => {
    expect(determineIndustry(stock({ symbol: 'NEWB', name: 'Some Regional Bank' })))
      .toBe('FINANCIAL');
  });

  it('falls back to DEFAULT for unrecognized symbols', () => {
    expect(determineIndustry(stock({ symbol: 'ZZZ', name: 'Unknown Co' }))).toBe('DEFAULT');
  });
});

describe('detectDataIssues', () => {
  it('flags negative FCF', () => {
    expect(detectDataIssues(stock({ fcfPerShare: -1 })).hasFcfIssue).toBe(true);
  });

  it('flags negative EPS', () => {
    expect(detectDataIssues(stock({ eps: -1 })).hasEpsIssue).toBe(true);
  });

  it('flags PE ratio outside (0, 100]', () => {
    expect(detectDataIssues(stock({ peRatio: 0 })).hasPeIssue).toBe(true);
    expect(detectDataIssues(stock({ peRatio: 150 })).hasPeIssue).toBe(true);
  });

  it('flags FCF that is unrealistically larger than EPS', () => {
    expect(detectDataIssues(stock({ eps: 5, fcfPerShare: 20 })).hasExtremeFcf).toBe(true);
  });
});

describe('getAdjustmentFactors', () => {
  it('returns special-case adjustments for BABA', () => {
    const adj = getAdjustmentFactors(stock({ symbol: 'BABA' }));
    expect(adj.fcfToEpsRatio).toBeCloseTo(0.85);
    expect(adj.terminalMultipleCap).toBe(15);
  });

  it('tightens caps when data has issues', () => {
    const adj = getAdjustmentFactors(stock({ eps: -5 }));
    expect(adj.priceToCap).toBeLessThanOrEqual(2.0);
  });

  it('applies Japanese-market priceToCap tightening for .T symbols', () => {
    const adj = getAdjustmentFactors(stock({ symbol: '6758.T', name: 'Sony Group Corp' }));
    expect(adj.priceToCap).toBeLessThanOrEqual(2.5);
  });
});

describe('describeIndustry', () => {
  it('reports a special-case label for symbols in specialCases', () => {
    expect(describeIndustry(stock({ symbol: 'BABA' }))).toMatch(/special-case/);
  });

  it('reports the industry classification for everything else', () => {
    expect(describeIndustry(stock({ symbol: 'AAPL' }))).toMatch(/TECHNOLOGY/);
  });
});
