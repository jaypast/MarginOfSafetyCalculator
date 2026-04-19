import { StockResponse } from '@shared/schema';
import { getYahooFinanceData } from './yahooFinance';
import { getRapidApiStockData } from './rapidApiFinance';
import { scrapeStockData } from './webScraper';
import { getFallbackStockData } from './fallbackData';

// In-memory cache: symbol → { data, timestamp }
const stockDataCache: { [symbol: string]: { data: StockResponse; timestamp: number } } = {};
const CACHE_DURATION = 20 * 60 * 1000; // 20 minutes

// In-flight deduplication: symbol → pending promise
// If a request for the same symbol is already in-flight, we return the same promise
// instead of spawning a duplicate API call (which causes rate-limit cascades).
const pendingRequests: Map<string, Promise<StockResponse>> = new Map();

// Concurrency limiter for yfinance Python subprocess calls.
// yfinance itself is rate-limited by Yahoo, so we cap simultaneous calls.
const MAX_CONCURRENT_YFINANCE = 3;
let activeYfinanceCalls = 0;
const yfinanceQueue: Array<() => void> = [];

function acquireYfinanceSlot(): Promise<void> {
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

function releaseYfinanceSlot(): void {
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

async function _fetchStockData(symbol: string): Promise<StockResponse> {
  const now = Date.now();

  // Return cached data if still fresh
  if (stockDataCache[symbol] && now - stockDataCache[symbol].timestamp < CACHE_DURATION) {
    console.log(`Returning cached data for ${symbol}`);
    return stockDataCache[symbol].data;
  }

  // --- Primary: yfinance Python (most reliable) ---
  console.log(`Using yfinance Python integration to fetch data for ${symbol}`);
  try {
    const yfinanceData = await fetchYfinanceWithQueue(symbol);

    stockDataCache[symbol] = { data: yfinanceData, timestamp: now };
    return yfinanceData;
  } catch (yfinanceError) {
    console.log(`yfinance failed for ${symbol}: ${yfinanceError}`);
    console.log(`Falling back to RapidAPI for ${symbol}...`);
  }

  // --- Secondary: RapidAPI ---
  console.log(`Using RapidAPI to fetch data for ${symbol}`);
  try {
    const rapidApiData = await getRapidApiStockData(symbol);

    stockDataCache[symbol] = { data: rapidApiData, timestamp: now };
    return rapidApiData;
  } catch (rapidApiError) {
    console.log(`RapidAPI fetch failed for ${symbol}: ${rapidApiError}`);
    console.log(`Falling back to web scraping for ${symbol}...`);
  }

  // --- Tertiary: Web scraping ---
  try {
    console.log(`Web scraping Yahoo Finance for ${symbol}...`);
    const scrapedData = await scrapeStockData(symbol);

    stockDataCache[symbol] = { data: scrapedData, timestamp: now };
    return scrapedData;
  } catch (scrapeError) {
    console.log(`Web scraping failed for ${symbol}: ${scrapeError}`);
    console.log(`Checking static fallback for ${symbol}...`);
  }

  // --- Quaternary: Static fallback for common stocks ---
  const fallbackData = getFallbackStockData(symbol);
  if (fallbackData) {
    console.log(`Using static fallback data for ${symbol}`);
    // Cache fallback with shorter TTL (5 min) so live data is retried sooner
    stockDataCache[symbol] = { data: fallbackData, timestamp: now - (15 * 60 * 1000) };
    return fallbackData;
  }

  // --- All sources exhausted ---
  console.log(`All data sources failed for ${symbol}, returning error response`);
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

export async function getStockData(symbol: string): Promise<StockResponse> {
  const key = symbol.toUpperCase();

  // If there's already a pending request for this symbol, reuse it
  if (pendingRequests.has(key)) {
    console.log(`Reusing in-flight request for ${key}`);
    return pendingRequests.get(key)!;
  }

  // Start a new request and register it so concurrent callers share it
  const requestPromise = _fetchStockData(key).finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, requestPromise);
  return requestPromise;
}
