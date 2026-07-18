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

  it('parses MarketCapitalization into marketCap (Task #37)', async () => {
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
                ReturnOnEquityTTM: '0.45',
                ProfitMargin: '0.25',
                OperatingMarginTTM: '0.30',
                Beta: '1.2',
                BookValue: '4.50',
                CurrentRatio: '1.05',
                MarketCapitalization: '2748967000000',
              },
            });
          }
          return Promise.resolve({
            data: { 'Global Quote': { '05. price': '170.25' } },
          });
        }),
      },
    }));

    const { getAlphaVantageData } = await import('../server/services/alphaVantage');
    const result = await getAlphaVantageData('AAPL');
    expect(stockResponseSchema.safeParse(result).success).toBe(true);
    expect(result.marketCap).toBe(2748967000000);
  });

  it('wires 52WeekHigh/Low into multibaggerSignals (Task #38)', async () => {
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
                ReturnOnEquityTTM: '0.45',
                ProfitMargin: '0.25',
                OperatingMarginTTM: '0.30',
                '52WeekHigh': '199.61',
                '52WeekLow': '164.08',
              },
            });
          }
          return Promise.resolve({
            data: { 'Global Quote': { '05. price': '170.25' } },
          });
        }),
      },
    }));

    const { getAlphaVantageData } = await import('../server/services/alphaVantage');
    const result = await getAlphaVantageData('AAPL');
    expect(stockResponseSchema.safeParse(result).success).toBe(true);
    expect(result.multibaggerSignals?.week52High).toBeCloseTo(199.61, 2);
    expect(result.multibaggerSignals?.week52Low).toBeCloseTo(164.08, 2);
    // FCF/balance-sheet fields remain null for AV (free tier).
    expect(result.multibaggerSignals?.fcfYield).toBeNull();
    expect(result.multibaggerSignals?.assetGrowth).toBeNull();
  });

  it('emits null week52High/Low when 52WeekHigh/Low are absent (Task #38)', async () => {
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
                ReturnOnEquityTTM: '0.10',
                ProfitMargin: '0.05',
                OperatingMarginTTM: '0.05',
                // 52WeekHigh/Low deliberately absent
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
    expect(result.multibaggerSignals?.week52High).toBeNull();
    expect(result.multibaggerSignals?.week52Low).toBeNull();
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
                marketCap: 2_748_967_000_000,
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
    // Task #37: marketCap passes through when the upstream provides it.
    expect(result.marketCap).toBe(2_748_967_000_000);
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
    // Task #37: marketCap must be null (not undefined/NaN) when absent.
    expect(result.marketCap).toBeNull();
  });

  it('wires fiftyTwoWeekHigh/Low from Stock Data API into multibaggerSignals (Task #38)', async () => {
    vi.doMock('axios', () => ({
      default: {
        get: vi.fn().mockImplementation((url: string) => {
          if (url.includes('/price')) {
            return Promise.resolve({
              data: {
                regularMarketPrice: 170.25,
                epsTrailingTwelveMonths: 6.1,
                fiftyTwoWeekHigh: 199.61,
                fiftyTwoWeekLow: 164.08,
              },
            });
          }
          return Promise.resolve({ data: { companyName: 'Apple Inc.' } });
        }),
      },
    }));

    const { getRapidApiStockData } = await import('../server/services/rapidApiFinance');
    const result = await getRapidApiStockData('AAPL');
    expect(stockResponseSchema.safeParse(result).success).toBe(true);
    expect(result.multibaggerSignals?.week52High).toBeCloseTo(199.61, 2);
    expect(result.multibaggerSignals?.week52Low).toBeCloseTo(164.08, 2);
    expect(result.multibaggerSignals?.fcfYield).toBeNull();
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

  // Adapter-level contract test for Task #37: when the Python helper
  // emits a `marketCap` field the TS adapter must pass it through.
  it('passes through marketCap from the Python payload', async () => {
    const payload = {
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
      marketCap: 2_748_967_000_000,
    };

    vi.doMock('child_process', () => ({
      exec: (cmd: string, cb: any) =>
        cb(null, { stdout: JSON.stringify(payload), stderr: '' }),
    }));

    const { getYahooFinanceData } = await import('../server/services/yahooFinance');
    const result = await getYahooFinanceData('AAPL');
    expect(stockResponseSchema.safeParse(result).success).toBe(true);
    expect(result.marketCap).toBe(2_748_967_000_000);
  });

  // Adapter-level contract test for Task #30: when the Python helper
  // emits a populated `multibaggerSignals` block (Yartseva 2025
  // empirics), the TS adapter must pass it straight through.
  it('passes through multibaggerSignals (fcfYield/assetGrowth/ebitdaGrowth/52w) from the Python payload', async () => {
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
      multibaggerSignals: {
        fcfYield: 6.2,
        assetGrowth: 4.1,
        ebitdaGrowth: 9.8,
        week52High: 420.0,
        week52Low: 290.0,
      },
    };

    vi.doMock('child_process', () => ({
      exec: (cmd: string, cb: any) =>
        cb(null, { stdout: JSON.stringify(payload), stderr: '' }),
    }));

    const { getYahooFinanceData } = await import('../server/services/yahooFinance');
    const result = await getYahooFinanceData('MSFT');
    expect(stockResponseSchema.safeParse(result).success).toBe(true);
    expect(result.multibaggerSignals).toBeDefined();
    expect(result.multibaggerSignals?.fcfYield).toBe(6.2);
    expect(result.multibaggerSignals?.assetGrowth).toBe(4.1);
    expect(result.multibaggerSignals?.ebitdaGrowth).toBe(9.8);
    expect(result.multibaggerSignals?.week52High).toBe(420.0);
    expect(result.multibaggerSignals?.week52Low).toBe(290.0);
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
    // Task #37: with no Market Cap row in the HTML, must be null not undefined.
    expect(result.marketCap).toBeNull();
  });

  it('parses 52 Week Range from key-statistics HTML into multibaggerSignals (Task #38)', async () => {
    const statsHtml = `<html><body><table>
      <tr><td>52 Week Range</td><td>164.08 - 199.61</td></tr>
    </table></body></html>`;

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
        if (url.includes('key-statistics')) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve(statsHtml) });
        }
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<html></html>') });
      });
      return { default: mockFetch };
    });

    const { scrapeStockData } = await import('../server/services/webScraper');
    const result = await scrapeStockData('AAPL');
    expect(stockResponseSchema.safeParse(result).success).toBe(true);
    expect(result.multibaggerSignals?.week52High).toBeCloseTo(199.61, 2);
    expect(result.multibaggerSignals?.week52Low).toBeCloseTo(164.08, 2);
    expect(result.multibaggerSignals?.fcfYield).toBeNull();
  });

  it('parses marketCap from the key-statistics HTML (Task #37)', async () => {
    // Simulate a stats page that has a "Market Cap" row with a value.
    const statsHtml = `<html><body><table><tr><td>Market Cap</td><td>2.89T</td></tr></table></body></html>`;

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
        if (url.includes('key-statistics')) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve(statsHtml) });
        }
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<html></html>') });
      });
      return { default: mockFetch };
    });

    const { scrapeStockData } = await import('../server/services/webScraper');
    const result = await scrapeStockData('AAPL');
    expect(stockResponseSchema.safeParse(result).success).toBe(true);
    // 2.89T = 2.89 × 1e12
    expect(result.marketCap).toBeCloseTo(2.89e12, -9);
  });

  it('throws when the simple-quote API itself fails', async () => {
    vi.doMock('node-fetch', () => ({
      default: vi.fn().mockResolvedValue({ ok: false }),
    }));

    const { scrapeStockData } = await import('../server/services/webScraper');
    await expect(scrapeStockData('AAPL')).rejects.toThrow();
  });
});

describe('fmpFinance adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.FINANCIAL_MODELING_PREP_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.FINANCIAL_MODELING_PREP_API_KEY;
  });

  it('returns a schema-valid StockResponse for a healthy company payload', async () => {
    vi.doMock('axios', () => ({
      default: {
        get: vi.fn().mockImplementation((url: string) => {
          if (url.includes('/profile')) {
            return Promise.resolve({
              data: [{
                symbol: 'FIG',
                companyName: 'Figma Inc.',
                price: 32.5,
                beta: 1.1,
                marketCap: 15_800_000_000,
                range: '24.10-58.75',
              }],
            });
          }
          if (url.includes('/ratios-ttm')) {
            return Promise.resolve({
              data: [{
                priceToEarningsRatioTTM: 26.0,
                debtToEquityRatioTTM: 0.35,
                currentRatioTTM: 2.1,
                netProfitMarginTTM: 0.116,
                operatingProfitMarginTTM: 0.146,
                priceToFreeCashFlowRatioTTM: 20.3125, // → FCF/share = 32.5 / 20.3125 = 1.6
              }],
            });
          }
          if (url.includes('/key-metrics-ttm')) {
            return Promise.resolve({
              data: [{
                returnOnEquityTTM: 0.18,
                freeCashFlowYieldTTM: 0.049,
                currentRatioTTM: 2.1,
              }],
            });
          }
          // income-statement (latest first)
          return Promise.resolve({
            data: [
              { revenue: 820_000_000, netIncome: 95_000_000, operatingIncome: 120_000_000, ebitda: 150_000_000, epsDiluted: 1.2 },
              { revenue: 650_000_000, netIncome: 70_000_000, operatingIncome: 90_000_000, ebitda: 110_000_000, epsDiluted: 0.9 },
            ],
          });
        }),
      },
    }));

    const { getFmpData } = await import('../server/services/fmpFinance');
    const result = await getFmpData('FIG');
    const parsed = stockResponseSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(result.symbol).toBe('FIG');
    expect(result.name).toBe('Figma Inc.');
    expect(result.price).toBe(32.5);
    // EPS derived from price ÷ TTM P/E = 32.5 / 26 = 1.25
    expect(result.eps).toBeCloseTo(1.25, 4);
    expect(result.peRatio).toBe(26.0);
    // FCF/share = price ÷ price-to-FCF = 32.5 / 20.3125 = 1.6
    expect(result.fcfPerShare).toBeCloseTo(1.6, 4);
    // returnOnEquityTTM 0.18 → 18%
    expect(result.roe).toBeCloseTo(18, 5);
    expect(result.debtToEquity).toBe(0.35);
    expect(result.currentRatio).toBe(2.1);
    // Revenue growth: (820 - 650) / 650 × 100 ≈ 26.15%
    expect(result.revenueGrowth).toBeCloseTo(26.15, 1);
    // Earnings growth preferred: (95 - 70) / 70 × 100 ≈ 35.71%
    expect(result.growthRate).toBeCloseTo(35.71, 1);
    expect(result.marketCap).toBe(15_800_000_000);
    // freeCashFlowYieldTTM 0.049 → 4.9%
    expect(result.multibaggerSignals?.fcfYield).toBeCloseTo(4.9, 5);
    // EBITDA growth: (150 - 110) / 110 × 100 ≈ 36.36%
    expect(result.multibaggerSignals?.ebitdaGrowth).toBeCloseTo(36.36, 1);
    // 52-week range parsed from profile.range "24.10-58.75"
    expect(result.multibaggerSignals?.week52High).toBeCloseTo(58.75, 2);
    expect(result.multibaggerSignals?.week52Low).toBeCloseTo(24.1, 2);
    // Balance-sheet-derived signal stays null (not fetched).
    expect(result.multibaggerSignals?.assetGrowth).toBeNull();
    expect(result.peHistory).toBeNull();
  });

  it('uses safe defaults when the fundamentals endpoints are premium-gated', async () => {
    vi.doMock('axios', () => ({
      default: {
        get: vi.fn().mockImplementation((url: string) => {
          if (url.includes('/profile')) {
            return Promise.resolve({
              data: [{ symbol: 'SPARSE', companyName: 'Sparse Co', price: 50 }],
            });
          }
          // ratios-ttm, key-metrics-ttm, income-statement all 402 upstream
          // (free-tier premium gating for some symbols, e.g. recent IPOs).
          return Promise.reject(new Error('402 premium symbol'));
        }),
      },
    }));

    const { getFmpData } = await import('../server/services/fmpFinance');
    const result = await getFmpData('SPARSE');
    expect(stockResponseSchema.safeParse(result).success).toBe(true);
    expect(result.price).toBe(50);
    // Missing numerics must be finite numbers, never NaN/undefined.
    expect(result.eps).toBe(0);
    expect(result.peRatio).toBe(0);
    expect(result.fcfPerShare).toBe(0);
    expect(result.debtToEquity).toBe(0.5);
    expect(result.currentRatio).toBe(1.5);
    expect(result.growthRate).toBe(0);
    expect(result.revenueGrowth).toBe(0);
    expect(result.earningsStability).toBe('Low');
    expect(result.competitivePosition).toBe('Average');
    // marketCap must be null (not undefined/NaN) when absent.
    expect(result.marketCap).toBeNull();
    expect(result.multibaggerSignals?.fcfYield).toBeNull();
    expect(result.multibaggerSignals?.week52High).toBeNull();
    expect(result.multibaggerSignals?.week52Low).toBeNull();
  });

  it('falls back to annual diluted EPS + EPS-based FCF when TTM ratios are missing', async () => {
    vi.doMock('axios', () => ({
      default: {
        get: vi.fn().mockImplementation((url: string) => {
          if (url.includes('/profile')) {
            return Promise.resolve({
              data: [{ symbol: 'TEST', companyName: 'Test Co', price: 30 }],
            });
          }
          if (url.includes('/ratios-ttm') || url.includes('/key-metrics-ttm')) {
            return Promise.resolve({ data: [{}] });
          }
          return Promise.resolve({
            data: [
              { revenue: 100_000_000, netIncome: 10_000_000, epsDiluted: 2.0 },
              { revenue: 90_000_000, netIncome: 9_000_000, epsDiluted: 1.8 },
            ],
          });
        }),
      },
    }));

    const { getFmpData } = await import('../server/services/fmpFinance');
    const result = await getFmpData('TEST');
    expect(stockResponseSchema.safeParse(result).success).toBe(true);
    expect(result.eps).toBe(2.0);
    // FCF waterfall: EPS-based estimate = 2 × 0.85 = 1.7
    expect(result.fcfPerShare).toBeCloseTo(1.7, 5);
    expect(result.appliedAdjustments?.join(' ')).toMatch(/EPS from latest annual income statement/);
  });

  it('throws when the upstream returns an empty profile array', async () => {
    vi.doMock('axios', () => ({
      default: { get: vi.fn().mockResolvedValue({ data: [] }) },
    }));

    const { getFmpData } = await import('../server/services/fmpFinance');
    await expect(getFmpData('NOPE')).rejects.toThrow(/no data/i);
  });

  it('throws immediately when the API key is not configured', async () => {
    delete process.env.FINANCIAL_MODELING_PREP_API_KEY;
    const axiosGet = vi.fn();
    vi.doMock('axios', () => ({ default: { get: axiosGet } }));

    const { getFmpData } = await import('../server/services/fmpFinance');
    await expect(getFmpData('AAPL')).rejects.toThrow(/not configured/i);
    // Must not spend an upstream call without a key.
    expect(axiosGet).not.toHaveBeenCalled();
  });
});
