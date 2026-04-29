import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stockResponseSchema } from '../shared/schema';

// Adapter normalization tests. Each provider service must turn its upstream
// payload into a StockResponse that passes stockResponseSchema.safeParse.

describe('alphaVantage adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ALPHA_VANTAGE_KEY = 'test-key';
    // Skip the 13s internal rate-limit gate by making setTimeout fire its
    // callback on the next microtask.
    vi.stubGlobal('setTimeout', ((fn: any) => {
      Promise.resolve().then(fn);
      return 0 as any;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns a schema-valid StockResponse for a healthy company payload', async () => {
    vi.doMock('axios', () => ({
      default: {
        get: vi.fn().mockImplementation((url: string, opts: any) => {
          if (opts.params.function === 'OVERVIEW') {
            return Promise.resolve({
              data: {
                Symbol: 'AAPL',
                Name: 'Apple Inc.',
                EPS: '6.10',
                PERatio: '28.50',
                OperatingCashflowPerShare: '7.20',
                QuarterlyEarningsGrowthYOY: '0.10',
                QuarterlyRevenueGrowthYOY: '0.08',
                ReturnOnEquityTTM: '0.45',
                ProfitMargin: '0.25',
                OperatingMarginTTM: '0.30',
                Beta: '1.2',
                BookValue: '4.50',
                CurrentRatio: '1.05',
                '52WeekHigh': '200',
                '52WeekLow': '150',
              },
            });
          }
          // GLOBAL_QUOTE
          return Promise.resolve({
            data: { 'Global Quote': { '05. price': '170.25' } },
          });
        }),
      },
    }));

    const { getAlphaVantageData } = await import('../server/services/alphaVantage');
    const result = await getAlphaVantageData('AAPL');
    const parsed = stockResponseSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(result.symbol).toBe('AAPL');
    expect(result.price).toBe(170.25);
    expect(result.eps).toBe(6.1);
    expect(result.peRatio).toBe(28.5);
    // growth: 0.10 (preferred) × 100
    expect(result.growthRate).toBeCloseTo(10, 5);
    expect(result.competitivePosition).toBe('Strong'); // ROE 45 > 20, OpMargin 30 > 15
  });

  it('falls back through the FCF waterfall when OperatingCashflowPerShare is missing', async () => {
    // Step 2 in the waterfall: EPS-based estimate = EPS × 0.85.
    vi.doMock('axios', () => ({
      default: {
        get: vi.fn().mockImplementation((url: string, opts: any) => {
          if (opts.params.function === 'OVERVIEW') {
            return Promise.resolve({
              data: {
                Symbol: 'TEST',
                Name: 'Test Co',
                EPS: '5.00',
                PERatio: '15.00',
                // OperatingCashflowPerShare deliberately absent
                ReturnOnEquityTTM: '0.10',
                ProfitMargin: '0.05',
                OperatingMarginTTM: '0.05',
              },
            });
          }
          return Promise.resolve({
            data: { 'Global Quote': { '05. price': '75.00' } },
          });
        }),
      },
    }));

    const { getAlphaVantageData } = await import('../server/services/alphaVantage');
    const result = await getAlphaVantageData('TEST');
    expect(stockResponseSchema.safeParse(result).success).toBe(true);
    // Waterfall step 2: EPS-based estimate = 5 × 0.85 = 4.25
    expect(result.fcfPerShare).toBeCloseTo(4.25, 5);
  });

  it('throws when the upstream returns an empty object', async () => {
    vi.doMock('axios', () => ({
      default: { get: vi.fn().mockResolvedValue({ data: {} }) },
    }));

    const { getAlphaVantageData } = await import('../server/services/alphaVantage');
    await expect(getAlphaVantageData('NOPE')).rejects.toThrow(/no data/i);
  });
});

describe('rapidApiFinance adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.RAPIDAPI_KEY = 'test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('normalizes the Stock Data API payload', async () => {
    vi.doMock('axios', () => ({
      default: {
        get: vi.fn().mockImplementation((url: string) => {
          if (url.includes('/price')) {
            return Promise.resolve({
              data: {
                regularMarketPrice: 170.25,
                epsTrailingTwelveMonths: 6.1,
                regularMarketPriceToEarnings: 28.5,
                freeCashflowPerShare: 7.2,
                earningsGrowth: 0.1,
                revenueGrowth: 0.08,
                returnOnEquity: 0.45,
                debtToEquity: 1.5,
                currentRatio: 1.05,
                grossMargin: 0.4,
                operatingMargin: 0.3,
              },
            });
          }
          // /profile
          return Promise.resolve({ data: { companyName: 'Apple Inc.' } });
        }),
      },
    }));

    const { getRapidApiStockData } = await import('../server/services/rapidApiFinance');
    const result = await getRapidApiStockData('AAPL');
    const parsed = stockResponseSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(result.symbol).toBe('AAPL');
    expect(result.name).toBe('Apple Inc.');
    expect(result.price).toBe(170.25);
    expect(result.eps).toBe(6.1);
    expect(result.peRatio).toBe(28.5);
    expect(result.fcfPerShare).toBe(7.2);
    expect(result.competitivePosition).toBe('Strong');
    expect(result.earningsStability).toBe('High');
  });

  it('uses safe defaults when fields are missing', async () => {
    vi.doMock('axios', () => ({
      default: {
        get: vi.fn().mockImplementation((url: string) => {
          if (url.includes('/price')) {
            return Promise.resolve({ data: { regularMarketPrice: 50 } });
          }
          return Promise.resolve({ data: {} });
        }),
      },
    }));

    const { getRapidApiStockData } = await import('../server/services/rapidApiFinance');
    const result = await getRapidApiStockData('SPARSE');
    expect(stockResponseSchema.safeParse(result).success).toBe(true);
    expect(result.price).toBe(50);
    expect(result.eps).toBe(0);
    expect(result.fcfPerShare).toBe(0);
    expect(result.earningsStability).toBe('Low');
    expect(result.competitivePosition).toBe('Average');
  });

  it('throws when both API paths fail', async () => {
    vi.doMock('axios', () => ({
      default: { get: vi.fn().mockRejectedValue(new Error('network down')) },
    }));

    const { getRapidApiStockData } = await import('../server/services/rapidApiFinance');
    await expect(getRapidApiStockData('AAPL')).rejects.toThrow();
  });
});

describe('yahooFinance adapter', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('parses the Python script JSON payload', async () => {
    const fakePayload = {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      price: 170.25,
      eps: 6.1,
      peRatio: 28.5,
      fcfPerShare: 7.2,
      growthRate: 10,
      roe: 45,
      debtToEquity: 1.5,
      currentRatio: 1.05,
      revenueGrowth: 8,
      earningsStability: 'High',
      competitivePosition: 'Strong',
    };

    vi.doMock('child_process', () => ({
      exec: (cmd: string, cb: any) => cb(null, { stdout: JSON.stringify(fakePayload), stderr: '' }),
    }));

    const { getYahooFinanceData } = await import('../server/services/yahooFinance');
    const result = await getYahooFinanceData('AAPL');
    const parsed = stockResponseSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(result.symbol).toBe('AAPL');
    expect(result.price).toBe(170.25);
  });

  // Adapter-level contract test for Task #15: when the Python helper
  // returns a populated `peHistory` block (5y/10y/industry medians),
  // the TS adapter must pass those keys straight through to the
  // schema-valid StockResponse — not drop or rename them.
  it('passes through peHistory keys (5y/10y/industry) from the Python payload', async () => {
    const payload = {
      symbol: 'MSFT',
      name: 'Microsoft Corp.',
      price: 380,
      eps: 11.0,
      peRatio: 34.5,
      fcfPerShare: 9.5,
      growthRate: 14,
      roe: 35,
      debtToEquity: 0.5,
      currentRatio: 1.8,
      revenueGrowth: 12,
      earningsStability: 'High',
      competitivePosition: 'Strong',
      peHistory: { fiveYearAvg: 31.2, tenYearAvg: 27.8, industryAvg: 28.0 },
    };

    vi.doMock('child_process', () => ({
      exec: (cmd: string, cb: any) =>
        cb(null, { stdout: JSON.stringify(payload), stderr: '' }),
    }));

    const { getYahooFinanceData } = await import('../server/services/yahooFinance');
    const result = await getYahooFinanceData('MSFT');
    expect(stockResponseSchema.safeParse(result).success).toBe(true);
    expect(result.peHistory).toBeDefined();
    expect(result.peHistory?.fiveYearAvg).toBe(31.2);
    expect(result.peHistory?.tenYearAvg).toBe(27.8);
    expect(result.peHistory?.industryAvg).toBe(28.0);
  });

  it('throws when the Python script reports an error', async () => {
    vi.doMock('child_process', () => ({
      exec: (cmd: string, cb: any) =>
        cb(null, { stdout: JSON.stringify({ error: true, message: 'no symbol' }), stderr: '' }),
    }));

    const { getYahooFinanceData } = await import('../server/services/yahooFinance');
    await expect(getYahooFinanceData('NOPE')).rejects.toThrow(/Failed to fetch data/);
  });

  it('throws when the subprocess itself fails', async () => {
    vi.doMock('child_process', () => ({
      exec: (cmd: string, cb: any) => cb(new Error('python missing'), { stdout: '', stderr: 'oops' }),
    }));

    const { getYahooFinanceData } = await import('../server/services/yahooFinance');
    await expect(getYahooFinanceData('AAPL')).rejects.toThrow(/Failed to fetch data/);
  });
});

describe('webScraper adapter', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns schema-valid output from the simple-quote API + minimal HTML', async () => {
    const minimalHtml = '<html><body></body></html>';

    vi.doMock('node-fetch', () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('query1.finance.yahoo.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              chart: {
                result: [{ meta: { regularMarketPrice: 170.25, shortName: 'Apple Inc.' } }],
              },
            }),
          });
        }
        // HTML pages
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(minimalHtml),
        });
      });
      return { default: mockFetch };
    });

    const { scrapeStockData } = await import('../server/services/webScraper');
    const result = await scrapeStockData('AAPL');
    const parsed = stockResponseSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(result.symbol).toBe('AAPL');
    expect(result.price).toBe(170.25);
    // Missing fields must default to numbers, never NaN/undefined.
    expect(Number.isFinite(result.eps)).toBe(true);
    expect(Number.isFinite(result.peRatio)).toBe(true);
    expect(Number.isFinite(result.fcfPerShare)).toBe(true);
  });

  it('throws when the simple-quote API itself fails', async () => {
    vi.doMock('node-fetch', () => ({
      default: vi.fn().mockResolvedValue({ ok: false }),
    }));

    const { scrapeStockData } = await import('../server/services/webScraper');
    await expect(scrapeStockData('AAPL')).rejects.toThrow();
  });
});
