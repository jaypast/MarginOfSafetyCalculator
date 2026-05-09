import { describe, it, expect } from 'vitest';
import {
  classifyFedRateEnvironment,
  parseFredCsv,
  pickCurrentAndYearAgo,
} from '../server/services/fedRate';
import {
  isGrowthTilted,
  shouldShowFedRateCaution,
} from '../client/src/components/ValueInvestorVerdict';
import type { StockData, FedRateResponse } from '../client/src/lib/types';

const baseStock: StockData = {
  symbol: 'TEST',
  name: 'Test Co',
  price: 100,
  eps: 5,
  peRatio: 20,
  fcfPerShare: 5,
  growthRate: 8,
  roe: 15,
  debtToEquity: 0.5,
  currentRatio: 2,
  revenueGrowth: 5,
  earningsStability: 'High',
  competitivePosition: 'Strong',
};

const risingEnv: FedRateResponse = {
  environment: 'rising',
  currentRate: 5.25,
  yearAgoRate: 4.5,
  deltaBp: 75,
  asOf: '2025-01-01',
  source: 'fred',
};

describe('classifyFedRateEnvironment — Task #31 thresholds', () => {
  it('classifies +50bp YoY exactly as rising (boundary inclusive)', () => {
    expect(classifyFedRateEnvironment(5.0, 4.5)).toEqual({
      environment: 'rising',
      deltaBp: 50,
    });
  });

  it('classifies +49bp YoY as stable (just under threshold)', () => {
    expect(classifyFedRateEnvironment(4.99, 4.5)).toEqual({
      environment: 'stable',
      deltaBp: 49,
    });
  });

  it('classifies −50bp YoY exactly as falling (boundary inclusive)', () => {
    expect(classifyFedRateEnvironment(4.0, 4.5)).toEqual({
      environment: 'falling',
      deltaBp: -50,
    });
  });

  it('classifies a flat YoY change as stable', () => {
    expect(classifyFedRateEnvironment(4.5, 4.5)).toEqual({
      environment: 'stable',
      deltaBp: 0,
    });
  });

  it('classifies a large hike (+200bp) as rising', () => {
    expect(classifyFedRateEnvironment(5.5, 3.5).environment).toBe('rising');
  });
});

describe('parseFredCsv', () => {
  it('drops the header row and missing-value sentinels', () => {
    const csv =
      'DATE,FEDFUNDS\n' +
      '2024-01-01,5.33\n' +
      '2024-02-01,.\n' +
      '2024-03-01,5.31\n';
    const obs = parseFredCsv(csv);
    expect(obs).toEqual([
      { date: '2024-01-01', value: 5.33 },
      { date: '2024-03-01', value: 5.31 },
    ]);
  });

  it('returns an empty list for an empty payload', () => {
    expect(parseFredCsv('DATE,FEDFUNDS\n')).toEqual([]);
  });
});

describe('pickCurrentAndYearAgo', () => {
  it('picks the latest observation and the closest one ~12 months back', () => {
    const obs = Array.from({ length: 25 }, (_, i) => ({
      date: `2023-${String((i % 12) + 1).padStart(2, '0')}-01`,
      value: i,
    }));
    // Build a clean monthly series across two years instead.
    const series = [];
    for (let year = 2023; year <= 2024; year++) {
      for (let m = 1; m <= 12; m++) {
        series.push({
          date: `${year}-${String(m).padStart(2, '0')}-01`,
          value: year + m / 100,
        });
      }
    }
    const picked = pickCurrentAndYearAgo(series);
    expect(picked).not.toBeNull();
    expect(picked!.current.date).toBe('2024-12-01');
    expect(picked!.yearAgo.date).toBe('2023-12-01');
  });

  it('returns null when there is fewer than two observations', () => {
    expect(pickCurrentAndYearAgo([])).toBeNull();
    expect(pickCurrentAndYearAgo([{ date: '2024-01-01', value: 5 }])).toBeNull();
  });
});

describe('isGrowthTilted — Task #31 caution trigger', () => {
  it('flags low FCF yield (< 2%)', () => {
    const stock: StockData = {
      ...baseStock,
      fcfPerShare: 1,
      price: 100, // 1% yield
      peRatio: 15,
      multibaggerSignals: null,
    };
    expect(isGrowthTilted(stock)).toBe(true);
  });

  it('flags high P/E (≥ 30)', () => {
    const stock: StockData = {
      ...baseStock,
      peRatio: 35,
      fcfPerShare: 5, // 5% yield, healthy
      multibaggerSignals: null,
    };
    expect(isGrowthTilted(stock)).toBe(true);
  });

  it('flags near-52w-high (rangePct > 80)', () => {
    const stock: StockData = {
      ...baseStock,
      peRatio: 15,
      multibaggerSignals: {
        fcfYield: 5,
        assetGrowth: null,
        ebitdaGrowth: null,
        week52High: 110,
        week52Low: 50,
        // price 100 → (100-50)/(110-50) = 83% → fires
      },
    };
    expect(isGrowthTilted(stock)).toBe(true);
  });

  it('does not flag a healthy, fairly-priced, mid-range stock', () => {
    const stock: StockData = {
      ...baseStock,
      peRatio: 15,
      fcfPerShare: 5,
      multibaggerSignals: {
        fcfYield: 5,
        assetGrowth: null,
        ebitdaGrowth: null,
        week52High: 120,
        week52Low: 80,
        // price 100 → (100-80)/(120-80) = 50% → no chip
      },
    };
    expect(isGrowthTilted(stock)).toBe(false);
  });

  it('prefers upstream multibaggerSignals.fcfYield over the per-share fallback', () => {
    const stock: StockData = {
      ...baseStock,
      fcfPerShare: 10, // would yield 10% via fallback
      price: 100,
      peRatio: 15,
      multibaggerSignals: {
        fcfYield: 1, // upstream says 1% — should fire
        assetGrowth: null,
        ebitdaGrowth: null,
        week52High: null,
        week52Low: null,
      },
    };
    expect(isGrowthTilted(stock)).toBe(true);
  });
});

describe('shouldShowFedRateCaution — gating logic', () => {
  const growthStock: StockData = {
    ...baseStock,
    peRatio: 35,
    multibaggerSignals: null,
  };
  const valueStock: StockData = {
    ...baseStock,
    peRatio: 12,
    fcfPerShare: 8,
    multibaggerSignals: null,
  };

  it('shows caution when env=rising AND stock is growth-tilted', () => {
    expect(shouldShowFedRateCaution(growthStock, risingEnv)).toBe(true);
  });

  it('hides caution when env=stable, even for a growth stock', () => {
    const stable: FedRateResponse = { ...risingEnv, environment: 'stable', deltaBp: 10 };
    expect(shouldShowFedRateCaution(growthStock, stable)).toBe(false);
  });

  it('hides caution when env=falling', () => {
    const falling: FedRateResponse = { ...risingEnv, environment: 'falling', deltaBp: -75 };
    expect(shouldShowFedRateCaution(growthStock, falling)).toBe(false);
  });

  it('hides caution for a value stock even when env=rising', () => {
    expect(shouldShowFedRateCaution(valueStock, risingEnv)).toBe(false);
  });

  it('hides caution when fed rate data is null/undefined (graceful degradation)', () => {
    expect(shouldShowFedRateCaution(growthStock, null)).toBe(false);
    expect(shouldShowFedRateCaution(growthStock, undefined)).toBe(false);
  });
});
