import { StockResponse } from '@shared/schema';
import { getYahooFinanceData } from './yahooFinance';
import { getRapidApiStockData } from './rapidApiFinance';
import { getAlphaVantageData } from './alphaVantage';
import { scrapeStockData } from './webScraper';
import { getFallbackStockData } from './fallbackData';

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
const stockDataCache: { [symbol: string]: { data: StockResponse; timestamp: number } } = {};
const CACHE_DURATION = 20 * 60 * 1000; // 20 minutes

// ---------------------------------------------------------------------------
// In-flight deduplication — concurrent requests for the same symbol share
// one upstream call instead of hammering every API simultaneously.
// ---------------------------------------------------------------------------
const pendingRequests: Map<string, Promise<StockResponse>> = new Map();

// ---------------------------------------------------------------------------
// yfinance concurrency limiter — Yahoo rate-limits the Python process when
// too many subprocesses run at the same time.
// ---------------------------------------------------------------------------
const MAX_CONCURRENT_YFINANCE = 3;
let activeYfinanceCalls = 0;
const yfinanceQueue: Array<() => void> = [];

export function acquireYfinanceSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (activeYfinanceCalls < MAX_CONCURRENT_YFINANCE) {
      activeYfinanceCalls++;
      resolve();
    } else {
      yfinanceQueue.push(() => {
        activeYfinanceCalls++;
        resolve();
      });
    }
  });
}

export function releaseYfinanceSlot(): void {
  activeYfinanceCalls--;
  if (yfinanceQueue.length > 0) {
    const next = yfinanceQueue.shift()!;
    next();
  }
}

async function fetchYfinanceWithQueue(symbol: string): Promise<StockResponse> {
  await acquireYfinanceSlot();
  try {
    return await getYahooFinanceData(symbol);
  } finally {
    releaseYfinanceSlot();
  }
}

// ---------------------------------------------------------------------------
// Data quality gate
// A response is considered "complete" when:
//   • price  > 0   (we know the current market price)
//   • at least one earnings/cash-flow metric is non-zero
//     (eps OR fcfPerShare — needed for any valuation method to work)
// ---------------------------------------------------------------------------
function isDataComplete(data: StockResponse): boolean {
  if (!data || data.error) return false;
  if (!data.price || data.price <= 0) return false;
  if ((!data.eps || data.eps === 0) && (!data.fcfPerShare || data.fcfPerShare === 0)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Metric derivation — fills in missing values from whatever IS present.
// Applied after every source attempt before the quality gate runs.
// Works for ANY stock; no hardcoded lists.
// ---------------------------------------------------------------------------
function deriveMetrics(data: StockResponse): StockResponse {
  const d = { ...data };

  // 1. EPS from P/E ratio
  if ((!d.eps || d.eps === 0) && d.peRatio > 0 && d.price > 0) {
    d.eps = parseFloat((d.price / d.peRatio).toFixed(4));
    console.log(`  Derived EPS for ${d.symbol}: ${d.eps} (price=${d.price} / PE=${d.peRatio})`);
  }

  // 2. P/E from EPS
  if ((!d.peRatio || d.peRatio === 0) && d.eps > 0 && d.price > 0) {
    d.peRatio = parseFloat((d.price / d.eps).toFixed(2));
  }

  // 3. FCF per share from EPS (conservative 75% proxy)
  if ((!d.fcfPerShare || d.fcfPerShare === 0) && d.eps > 0) {
    d.fcfPerShare = parseFloat((d.eps * 0.75).toFixed(4));
    console.log(`  Derived FCF/share for ${d.symbol}: ${d.fcfPerShare} (EPS × 0.75)`);
  }

  // 4. Growth rate: prefer earnings growth, fall back to revenue growth,
  //    then a conservative long-run baseline of 8%
  if (!d.growthRate || d.growthRate === 0) {
    if (d.revenueGrowth && d.revenueGrowth !== 0) {
      d.growthRate = d.revenueGrowth;
      console.log(`  Derived growthRate for ${d.symbol}: ${d.growthRate} (from revenueGrowth)`);
    } else {
      d.growthRate = 8; // long-run nominal baseline
      console.log(`  Using baseline growthRate=8 for ${d.symbol}`);
    }
  }

  // 5. ROE fallback
  if (!d.roe || d.roe === 0) {
    d.roe = 10; // neutral baseline
  }

  return d;
}

// ---------------------------------------------------------------------------
// Core fetch logic
// ---------------------------------------------------------------------------
async function _fetchStockData(symbol: string): Promise<StockResponse> {
  const now = Date.now();

  // Serve from cache if still fresh
  if (stockDataCache[symbol] && now - stockDataCache[symbol].timestamp < CACHE_DURATION) {
    console.log(`Returning cached data for ${symbol}`);
    return stockDataCache[symbol].data;
  }

  // Helper: try a source, derive missing metrics, check quality gate
  async function trySource(
    label: string,
    fetcher: () => Promise<StockResponse>
  ): Promise<StockResponse | null> {
    try {
      console.log(`[${symbol}] Trying ${label}...`);
      let data = await fetcher();
      data = deriveMetrics(data);
      if (isDataComplete(data)) {
        console.log(`[${symbol}] ${label} returned complete data ✓`);
        return data;
      }
      console.log(`[${symbol}] ${label} returned incomplete data — price=${data.price}, eps=${data.eps}, fcf=${data.fcfPerShare}`);
      return null;
    } catch (err) {
      console.log(`[${symbol}] ${label} failed: ${err}`);
      return null;
    }
  }

  // --- 1. yfinance (Python — most reliable for broad symbol coverage) ---
  const yfinanceResult = await trySource('yfinance', () => fetchYfinanceWithQueue(symbol));
  if (yfinanceResult) {
    stockDataCache[symbol] = { data: yfinanceResult, timestamp: now };
    return yfinanceResult;
  }

  // --- 2. RapidAPI ---
  const rapidResult = await trySource('RapidAPI', () => getRapidApiStockData(symbol));
  if (rapidResult) {
    stockDataCache[symbol] = { data: rapidResult, timestamp: now };
    return rapidResult;
  }

  // --- 3. Alpha Vantage (dedicated fundamentals API) ---
  const avResult = await trySource('Alpha Vantage', () => getAlphaVantageData(symbol));
  if (avResult) {
    stockDataCache[symbol] = { data: avResult, timestamp: now };
    return avResult;
  }

  // --- 4. Web scraping ---
  const scrapeResult = await trySource('web scraping', () => scrapeStockData(symbol));
  if (scrapeResult) {
    stockDataCache[symbol] = { data: scrapeResult, timestamp: now };
    return scrapeResult;
  }

  // --- 5. Static fallback (5 common stocks) ---
  const fallbackData = getFallbackStockData(symbol);
  if (fallbackData) {
    const derived = deriveMetrics(fallbackData);
    console.log(`[${symbol}] Using static fallback data`);
    stockDataCache[symbol] = { data: derived, timestamp: now - (15 * 60 * 1000) };
    return derived;
  }

  // --- All sources exhausted ---
  console.log(`[${symbol}] All data sources exhausted — returning error response`);
  return {
    symbol,
    name: symbol,
    price: 0,
    eps: 0,
    peRatio: 0,
    fcfPerShare: 0,
    growthRate: 0,
    roe: 0,
    debtToEquity: 0,
    currentRatio: 0,
    revenueGrowth: 0,
    earningsStability: 'Low',
    competitivePosition: 'Average',
    error: true,
    errorMessage: `Could not load data for "${symbol}". Please verify the ticker symbol is correct (e.g. AAPL, MSFT, BP.L) and try again.`,
  } as StockResponse;
}

// ---------------------------------------------------------------------------
// Public API — deduplicates concurrent requests for the same symbol
// ---------------------------------------------------------------------------
export async function getStockData(symbol: string): Promise<StockResponse> {
  const key = symbol.toUpperCase();

  if (pendingRequests.has(key)) {
    console.log(`Reusing in-flight request for ${key}`);
    return pendingRequests.get(key)!;
  }

  const requestPromise = _fetchStockData(key).finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, requestPromise);
  return requestPromise;
}
