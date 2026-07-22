import { describe, it, expect } from 'vitest';
import {
  scoreTicker,
  compositeBand,
  FACTOR_WEIGHTS,
  type SubScoreKey,
} from '../client/src/lib/multibaggerScreener';
import { sortEntriesByScore } from '../client/src/pages/Watchlist';
import type { StockData } from '../client/src/lib/types';

// Compose a "complete data" stock — every multibagger signal populated, ROE
// positive, FCF positive, current price strictly inside the 52-week range.
// Tests then mutate just the field they're exercising so the rest of the
// scorer stays a no-op.
function makeStock(overrides: Partial<StockData> = {}): StockData {
  return {
    symbol: 'TEST',
    name: 'Test Co.',
    price: 50,
    eps: 3,
    peRatio: 16,
    fcfPerShare: 3,
    growthRate: 8,
    roe: 15,
    debtToEquity: 0.5,
    currentRatio: 2,
    revenueGrowth: 6,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    multibaggerSignals: {
      fcfYield: 6,            // > 5% → strong value score
      assetGrowth: 4,
      ebitdaGrowth: 8,        // ebitda outpaces assets → 100 investment
      week52High: 60,
      week52Low: 40,           // price 50 → 50% of range → 50 score
    },
    ...overrides,
  };
}

const findScore = (stock: StockData, key: SubScoreKey) =>
  scoreTicker(stock).subScores.find((s) => s.key === key)!;

describe('multibaggerScreener — scoring math', () => {
  it('returns five sub-scores keyed in canonical order', () => {
    const result = scoreTicker(makeStock());
    expect(result.subScores.map((s) => s.key)).toEqual([
      'size', 'value', 'profitability', 'investment', 'range',
    ]);
  });

  it('weights sum to 1 (renormalisation invariant)', () => {
    const total = Object.values(FACTOR_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  describe('value (FCF yield)', () => {
    it('hits 100 at ≥10% FCF yield', () => {
      const stock = makeStock({ multibaggerSignals: { ...makeStock().multibaggerSignals!, fcfYield: 12 } });
      expect(findScore(stock, 'value').score).toBe(100);
    });

    it('scales linearly between 0 and 10%', () => {
      const stock = makeStock({ multibaggerSignals: { ...makeStock().multibaggerSignals!, fcfYield: 5 } });
      expect(findScore(stock, 'value').score).toBeCloseTo(50, 5);
    });

    it('scores 0 when FCF yield is non-positive (negative FCF edge case)', () => {
      const stock = makeStock({
        multibaggerSignals: { ...makeStock().multibaggerSignals!, fcfYield: -3 },
      });
      const sub = findScore(stock, 'value');
      expect(sub.score).toBe(0);
      expect(sub.rationale).toMatch(/consuming cash/i);
    });

    it('falls back to fcfPerShare/price when upstream yield missing', () => {
      const stock = makeStock({
        fcfPerShare: 5,
        price: 100,
        multibaggerSignals: { ...makeStock().multibaggerSignals!, fcfYield: null },
      });
      // 5/100 = 5% → score = 50
      expect(findScore(stock, 'value').score).toBeCloseTo(50, 5);
    });

    it('returns null when neither upstream yield nor per-share derivation can be computed', () => {
      const stock = makeStock({
        price: 0,
        fcfPerShare: NaN,
        multibaggerSignals: { ...makeStock().multibaggerSignals!, fcfYield: null },
      });
      expect(findScore(stock, 'value').score).toBeNull();
    });
  });

  describe('profitability (ROA proxy via ROE)', () => {
    it('hits 100 at ROE ≥ 20%', () => {
      expect(findScore(makeStock({ roe: 25 }), 'profitability').score).toBe(100);
    });

    it('scales linearly 0..20%', () => {
      expect(findScore(makeStock({ roe: 10 }), 'profitability').score).toBeCloseTo(50, 5);
    });

    it('scores 0 when ROE is non-positive (loss-making edge case)', () => {
      const sub = findScore(makeStock({ roe: -5 }), 'profitability');
      expect(sub.score).toBe(0);
    });

    it('rationale flags the ROE → ROA proxy substitution', () => {
      const sub = findScore(makeStock(), 'profitability');
      expect(sub.rationale).toMatch(/proxy/i);
    });
  });

  describe('investment affordability', () => {
    it('scores 100 when assets grow no faster than EBITDA', () => {
      const stock = makeStock({
        multibaggerSignals: {
          ...makeStock().multibaggerSignals!,
          assetGrowth: 5,
          ebitdaGrowth: 10,
        },
      });
      expect(findScore(stock, 'investment').score).toBe(100);
    });

    it('subtracts 5 points per pp of asset-over-EBITDA excess', () => {
      const stock = makeStock({
        multibaggerSignals: {
          ...makeStock().multibaggerSignals!,
          assetGrowth: 14,
          ebitdaGrowth: 4,           // gap = 10pp → 100 - 50 = 50
        },
      });
      expect(findScore(stock, 'investment').score).toBe(50);
    });

    it('floors at 0 when the gap is huge', () => {
      const stock = makeStock({
        multibaggerSignals: {
          ...makeStock().multibaggerSignals!,
          assetGrowth: 50,
          ebitdaGrowth: 5,
        },
      });
      expect(findScore(stock, 'investment').score).toBe(0);
    });

    it('returns null when either growth signal is missing', () => {
      const stock = makeStock({
        multibaggerSignals: { ...makeStock().multibaggerSignals!, assetGrowth: null },
      });
      expect(findScore(stock, 'investment').score).toBeNull();
    });
  });

  describe('52-week range', () => {
    it('scores ~100 at the bottom of the range', () => {
      const stock = makeStock({ price: 41, multibaggerSignals: { ...makeStock().multibaggerSignals!, week52Low: 40, week52High: 60 } });
      expect(findScore(stock, 'range').score).toBeGreaterThan(90);
    });

    it('scores ~0 at the top of the range', () => {
      const stock = makeStock({ price: 60, multibaggerSignals: { ...makeStock().multibaggerSignals!, week52Low: 40, week52High: 60 } });
      expect(findScore(stock, 'range').score).toBe(0);
    });

    it('clamps when price has broken outside the trailing 52w range', () => {
      const stock = makeStock({ price: 70, multibaggerSignals: { ...makeStock().multibaggerSignals!, week52Low: 40, week52High: 60 } });
      expect(findScore(stock, 'range').score).toBe(0);
    });

    it('returns null when high ≤ low (degenerate)', () => {
      const stock = makeStock({ multibaggerSignals: { ...makeStock().multibaggerSignals!, week52Low: 60, week52High: 60 } });
      expect(findScore(stock, 'range').score).toBeNull();
    });
  });

  describe('size (market cap proxy)', () => {
    it('returns null when marketCap is absent (adapter did not supply it)', () => {
      const sub = findScore(makeStock(), 'size');
      expect(sub.score).toBeNull();
      expect(sub.rationale).toMatch(/market cap unavailable/i);
    });

    it('scores 100 for sub-$2B market cap', () => {
      const stock = makeStock({ marketCap: 1.5e9 });
      expect(findScore(stock, 'size').score).toBe(100);
    });

    it('penalises mega-caps (>$1T → 0)', () => {
      const stock = makeStock({ marketCap: 2e12 });
      expect(findScore(stock, 'size').score).toBe(0);
    });

    it('returns null when marketCap is null', () => {
      const stock = makeStock({ marketCap: null });
      expect(findScore(stock, 'size').score).toBeNull();
    });

    it('scores mid-range for a $50B market cap', () => {
      const stock = makeStock({ marketCap: 50e9 });
      expect(findScore(stock, 'size').score).toBe(50);
    });
  });
});

describe('multibaggerScreener — composite & missing-data handling', () => {
  it('renormalises composite when sub-scores are missing', () => {
    // Default makeStock has size=null. Composite weights {value, prof, inv, range}
    // → 0.35 + 0.10 + 0.20 + 0.20 = 0.85.
    const result = scoreTicker(makeStock());
    expect(result.missingFactors).toEqual(['size']);
    // Sanity: composite is finite, between min and max sub-score.
    const computed = result.subScores.filter((s) => s.score !== null).map((s) => s.score!);
    expect(result.composite).not.toBeNull();
    expect(result.composite!).toBeGreaterThanOrEqual(Math.min(...computed) - 0.1);
    expect(result.composite!).toBeLessThanOrEqual(Math.max(...computed) + 0.1);
  });

  it('returns null composite when every sub-score is missing', () => {
    const stock = makeStock({
      price: 0,
      fcfPerShare: NaN,
      roe: NaN,
      multibaggerSignals: {
        fcfYield: null,
        assetGrowth: null,
        ebitdaGrowth: null,
        week52High: null,
        week52Low: null,
      },
    });
    const r = scoreTicker(stock);
    expect(r.composite).toBeNull();
    expect(r.missingFactors).toEqual(['size', 'value', 'profitability', 'investment', 'range']);
  });

  it('handles a near-zero-earnings stock without producing NaN', () => {
    const stock = makeStock({ eps: 0.01, roe: 0.5 });
    const r = scoreTicker(stock);
    expect(r.composite).not.toBeNull();
    expect(Number.isFinite(r.composite!)).toBe(true);
  });

  it('handles missing multibaggerSignals block entirely', () => {
    const stock = makeStock({ multibaggerSignals: null });
    const r = scoreTicker(stock);
    // Falls back to fcfPerShare/price for value; investment + range go missing.
    expect(r.missingFactors).toContain('investment');
    expect(r.missingFactors).toContain('range');
    expect(r.composite).not.toBeNull();
  });
});

describe('multibaggerScreener — low-confidence flag (< 4 computed factors)', () => {
  it('is NOT low confidence when all 5 factors compute', () => {
    const stock = makeStock({ marketCap: 5e9 });
    const r = scoreTicker(stock);
    expect(r.computedFactors).toBe(5);
    expect(r.lowConfidence).toBe(false);
  });

  it('is NOT low confidence at exactly 4 computed factors (boundary)', () => {
    // Default makeStock has no marketCap → size is the only missing factor.
    const r = scoreTicker(makeStock());
    expect(r.computedFactors).toBe(4);
    expect(r.lowConfidence).toBe(false);
  });

  it('IS low confidence at 3 computed factors (boundary)', () => {
    // Drop size (no marketCap) AND the 52-week range → 3 computed.
    const stock = makeStock({
      multibaggerSignals: {
        ...makeStock().multibaggerSignals!,
        week52High: null,
        week52Low: null,
      },
    });
    const r = scoreTicker(stock);
    expect(r.computedFactors).toBe(3);
    expect(r.lowConfidence).toBe(true);
    expect(r.composite).not.toBeNull(); // score still shown, but flagged
  });

  it('IS low confidence at 2 computed factors (signals block missing)', () => {
    // No marketCap, no signals block: value falls back to fcfPerShare/price,
    // profitability computes from ROE — everything else is missing.
    const r = scoreTicker(makeStock({ multibaggerSignals: null }));
    expect(r.computedFactors).toBe(2);
    expect(r.lowConfidence).toBe(true);
  });

  it('is NOT flagged low confidence when nothing computed — composite is null instead', () => {
    const stock = makeStock({
      price: 0,
      fcfPerShare: NaN,
      roe: NaN,
      multibaggerSignals: {
        fcfYield: null,
        assetGrowth: null,
        ebitdaGrowth: null,
        week52High: null,
        week52Low: null,
      },
    });
    const r = scoreTicker(stock);
    expect(r.computedFactors).toBe(0);
    expect(r.composite).toBeNull();
    // The "Insufficient data" band already covers this state; the warning
    // flag is reserved for a composite that exists but is unreliable.
    expect(r.lowConfidence).toBe(false);
  });
});

describe('multibaggerScreener — composite band labels', () => {
  it('labels a strong composite ≥ 65 as "Strong"', () => {
    expect(compositeBand(80).label).toBe('Strong');
    expect(compositeBand(80).tone).toBe('positive');
  });
  it('labels 40..65 as "Moderate"', () => {
    expect(compositeBand(50).label).toBe('Moderate');
  });
  it('labels < 40 as "Weak"', () => {
    expect(compositeBand(30).label).toBe('Weak');
    expect(compositeBand(30).tone).toBe('negative');
  });
  it('labels null composite as "Insufficient data"', () => {
    expect(compositeBand(null).label).toBe('Insufficient data');
    expect(compositeBand(null).tone).toBe('muted');
  });
});

describe('multibaggerScreener — bulk scoring & sort (watchlist path)', () => {
  // Mirrors how the watchlist page sorts cached entries by composite score.
  function bulkScoreAndSort(stocks: StockData[]): { symbol: string; composite: number | null }[] {
    return stocks
      .map((s) => ({ symbol: s.symbol, composite: scoreTicker(s).composite }))
      .sort((a, b) => {
        if (a.composite === null && b.composite === null) return 0;
        if (a.composite === null) return 1;
        if (b.composite === null) return -1;
        return b.composite - a.composite;
      });
  }

  // Watchlist parent uses sortEntriesByScore + a closure over useQueries
  // results. Simulates the async-resolution case the reviewer flagged: we
  // re-run the sort each time another row's stock data resolves and assert
  // that the order updates accordingly.
  it('sortEntriesByScore reorders reactively as per-row data resolves', () => {
    const entries = [
      { symbol: 'AAA' },
      { symbol: 'BBB' },
      { symbol: 'CCC' },
    ];
    const fetched: Record<string, StockData | undefined> = {
      AAA: undefined,
      BBB: undefined,
      CCC: undefined,
    };
    // Closure mirrors the parent's `scoreFor` — it reads from a live
    // mutable map (the useQueries result list in the real component).
    const scoreFor = (symbol: string) => {
      const stock = fetched[symbol];
      if (!stock) return null;
      return scoreTicker(stock);
    };

    // First render — nothing fetched yet, all sort to the tail in stable order.
    expect(sortEntriesByScore(entries, scoreFor).map((e) => e.symbol))
      .toEqual(['AAA', 'BBB', 'CCC']);

    // BBB resolves first with a strong score.
    fetched.BBB = makeStock({
      symbol: 'BBB',
      roe: 25,
      multibaggerSignals: { ...makeStock().multibaggerSignals!, fcfYield: 9 },
    });
    expect(sortEntriesByScore(entries, scoreFor).map((e) => e.symbol))
      .toEqual(['BBB', 'AAA', 'CCC']);

    // CCC resolves with a weak score; AAA still pending.
    fetched.CCC = makeStock({
      symbol: 'CCC',
      roe: 2,
      multibaggerSignals: { ...makeStock().multibaggerSignals!, fcfYield: 0.5 },
    });
    const afterCCC = sortEntriesByScore(entries, scoreFor).map((e) => e.symbol);
    expect(afterCCC[0]).toBe('BBB');           // still strongest
    expect(afterCCC[afterCCC.length - 1]).toBe('AAA'); // null sorts last

    // AAA finally resolves with a mid-range score — final order should be
    // BBB > AAA > CCC by composite descending.
    fetched.AAA = makeStock({ symbol: 'AAA' });
    expect(sortEntriesByScore(entries, scoreFor).map((e) => e.symbol))
      .toEqual(['BBB', 'AAA', 'CCC']);
  });

  it('scores every entry without mutating the inputs', () => {
    const a = makeStock({ symbol: 'A', multibaggerSignals: { ...makeStock().multibaggerSignals!, fcfYield: 9 } });
    const b = makeStock({ symbol: 'B', multibaggerSignals: { ...makeStock().multibaggerSignals!, fcfYield: 1 } });
    const before = JSON.stringify([a, b]);
    bulkScoreAndSort([a, b]);
    expect(JSON.stringify([a, b])).toBe(before);
  });

  it('sorts highest composite first and pushes nulls to the tail', () => {
    const high = makeStock({ symbol: 'HIGH', roe: 25, multibaggerSignals: { ...makeStock().multibaggerSignals!, fcfYield: 9 } });
    const mid = makeStock({ symbol: 'MID' });
    const broken = makeStock({
      symbol: 'BROKEN',
      price: 0,
      fcfPerShare: NaN,
      roe: NaN,
      multibaggerSignals: {
        fcfYield: null, assetGrowth: null, ebitdaGrowth: null,
        week52High: null, week52Low: null,
      },
    });
    const sorted = bulkScoreAndSort([mid, broken, high]);
    expect(sorted.map((r) => r.symbol)).toEqual(['HIGH', 'MID', 'BROKEN']);
    expect(sorted[2].composite).toBeNull();
  });

  it('demotes low-confidence scores below reliable ones but above nulls', () => {
    const stocks: Record<string, StockData | undefined> = {
      // Reliable (4 factors) with a modest composite.
      RELIABLE: makeStock({ symbol: 'RELIABLE', roe: 8, multibaggerSignals: { ...makeStock().multibaggerSignals!, fcfYield: 2 } }),
      // Low-confidence (2 factors: value fallback + profitability) but with a
      // HIGH face-value composite — must still rank below RELIABLE.
      SPARSE: makeStock({ symbol: 'SPARSE', roe: 30, fcfPerShare: 6, multibaggerSignals: null }),
      // No score at all.
      NONE: undefined,
    };
    const scoreFor = (symbol: string) => {
      const stock = stocks[symbol];
      return stock ? scoreTicker(stock) : null;
    };
    // Sanity: SPARSE really is low-confidence with the higher raw composite.
    const sparse = scoreTicker(stocks.SPARSE!);
    const reliable = scoreTicker(stocks.RELIABLE!);
    expect(sparse.lowConfidence).toBe(true);
    expect(reliable.lowConfidence).toBe(false);
    expect(sparse.composite!).toBeGreaterThan(reliable.composite!);

    const entries = [{ symbol: 'SPARSE' }, { symbol: 'NONE' }, { symbol: 'RELIABLE' }];
    expect(sortEntriesByScore(entries, scoreFor).map((e) => e.symbol))
      .toEqual(['RELIABLE', 'SPARSE', 'NONE']);
  });
});
