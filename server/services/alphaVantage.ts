import axios from 'axios';
import { StockResponse } from '@shared/schema';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY;
const BASE_URL = 'https://www.alphavantage.co/query';

if (!ALPHA_VANTAGE_KEY) {
  console.warn('ALPHA_VANTAGE_KEY is not set. Alpha Vantage fallback will not work.');
}

// Alpha Vantage free tier: 25 requests/day, 5/minute.
// We track the last call time and enforce a minimum gap between calls.
let lastCallTime = 0;
const MIN_CALL_GAP_MS = 13000; // ~4.6 calls/min to stay safely under 5/min

async function rateLimitedGet(params: Record<string, string>): Promise<any> {
  const now = Date.now();
  const gap = now - lastCallTime;
  if (gap < MIN_CALL_GAP_MS) {
    await new Promise(r => setTimeout(r, MIN_CALL_GAP_MS - gap));
  }
  lastCallTime = Date.now();
  const response = await axios.get(BASE_URL, { params, timeout: 15000 });
  return response.data;
}

/**
 * Fetch complete stock fundamentals + price from Alpha Vantage.
 * Uses OVERVIEW (fundamentals) + GLOBAL_QUOTE (current price).
 */
export async function getAlphaVantageData(symbol: string): Promise<StockResponse> {
  console.log(`Fetching Alpha Vantage data for ${symbol}`);

  if (!ALPHA_VANTAGE_KEY) {
    throw new Error('ALPHA_VANTAGE_KEY not configured');
  }

  // Fetch company overview (fundamentals)
  const overview = await rateLimitedGet({
    function: 'OVERVIEW',
    symbol,
    apikey: ALPHA_VANTAGE_KEY,
  });

  // Alpha Vantage returns an empty object {} for unknown symbols
  if (!overview || !overview.Symbol) {
    throw new Error(`Alpha Vantage: no data found for symbol "${symbol}"`);
  }

  // Also fetch current price via GLOBAL_QUOTE
  let price = 0;
  try {
    const quote = await rateLimitedGet({
      function: 'GLOBAL_QUOTE',
      symbol,
      apikey: ALPHA_VANTAGE_KEY,
    });
    price = parseFloat(quote?.['Global Quote']?.['05. price'] ?? '0') || 0;
  } catch {
    // Fall back to 52-week average estimate if price fetch fails
    const high = parseFloat(overview['52WeekHigh'] ?? '0');
    const low = parseFloat(overview['52WeekLow'] ?? '0');
    price = high && low ? (high + low) / 2 : 0;
  }

  const eps = parseFloat(overview.EPS ?? '0') || 0;
  const peRatio = parseFloat(overview.PERatio ?? '0') || 0;
  const sharesOutstanding = parseFloat(overview.SharesOutstanding ?? '0') || 0;

  // FCF per share — AV doesn't expose this directly; estimate from operating CF
  // We use OperatingCashflowPerShare if available, else eps * 0.85
  const fcfPerShare =
    parseFloat(overview.OperatingCashflowPerShare ?? '0') ||
    (eps > 0 ? eps * 0.85 : 0);

  // Growth: prefer quarterly earnings growth, then revenue growth
  const earningsGrowthRaw = parseFloat(overview.QuarterlyEarningsGrowthYOY ?? '0');
  const revenueGrowthRaw = parseFloat(overview.QuarterlyRevenueGrowthYOY ?? '0');
  const growthRate = (earningsGrowthRaw || revenueGrowthRaw || 0) * 100;

  const roe = parseFloat(overview.ReturnOnEquityTTM ?? '0') * 100 || 0;
  const profitMargin = parseFloat(overview.ProfitMargin ?? '0') || 0;
  const operatingMargin = parseFloat(overview.OperatingMarginTTM ?? '0') || 0;
  const revenueGrowth = revenueGrowthRaw * 100;
  const beta = parseFloat(overview.Beta ?? '1') || 1;

  // Debt-to-equity not directly in OVERVIEW; use book value vs market cap proxy
  // AV provides BookValue per share
  const bookValuePerShare = parseFloat(overview.BookValue ?? '0') || 0;
  const debtToEquity = bookValuePerShare > 0 && price > 0
    ? Math.max(0, (price / bookValuePerShare - 1))
    : 0.5;

  const currentRatio = parseFloat(overview.CurrentRatio ?? '1.5') || 1.5;

  // Earnings stability from beta and profit margin
  let earningsStability: 'High' | 'Medium' | 'Low';
  if (beta < 0.8 && profitMargin > 0.15) earningsStability = 'High';
  else if (beta < 1.3 && profitMargin > 0.05) earningsStability = 'Medium';
  else earningsStability = 'Low';

  // Competitive position from ROE and operating margin
  let competitivePosition: 'Strong' | 'Good' | 'Average';
  if (roe > 20 && operatingMargin > 0.15) competitivePosition = 'Strong';
  else if (roe > 12 && operatingMargin > 0.08) competitivePosition = 'Good';
  else competitivePosition = 'Average';

  const result: StockResponse = {
    symbol: overview.Symbol || symbol,
    name: overview.Name || symbol,
    price,
    eps,
    peRatio,
    fcfPerShare,
    growthRate,
    roe,
    debtToEquity,
    currentRatio,
    revenueGrowth,
    earningsStability,
    competitivePosition,
    lastUpdated: new Date().toISOString(),
  };

  console.log(`Alpha Vantage data for ${symbol}: price=${price}, eps=${eps}, growth=${growthRate}%`);
  return result;
}
