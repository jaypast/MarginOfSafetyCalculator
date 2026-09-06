import axios from 'axios';
import { StockResponse } from '@shared/schema';

// Financial Modeling Prep (FMP) adapter — tier between Alpha Vantage and the
// web scraper. FMP's TTM ratio/metric endpoints expose the full fundamental
// set the calculators need (P/E, FCF, ROE, D/E, current ratio), which is
// exactly what mid/small-cap tickers are often missing from the higher tiers.
//
// IMPORTANT: keys issued after August 2025 only work against the "stable"
// API (https://financialmodelingprep.com/stable/...?symbol=X). The legacy
// /api/v3/... endpoints return 403 for them. Free tier: 250 calls/day
// (this adapter spends up to 4 per ticker). Some symbols (e.g. recent
// IPOs) are premium-gated for fundamentals on the free tier — those still
// return a profile (live price + market cap + 52-week range), and the
// missing fields fall back to safe defaults.

const FMP_API_KEY = process.env.FINANCIAL_MODELING_PREP_API_KEY;
const BASE_URL = 'https://financialmodelingprep.com/stable';

if (!FMP_API_KEY) {
  console.warn('FINANCIAL_MODELING_PREP_API_KEY is not set. FMP fallback tier will be skipped.');
}

async function fmpGet(path: string, params: Record<string, string>): Promise<any> {
  const response = await axios.get(`${BASE_URL}${path}`, {
    params: { ...params, apikey: FMP_API_KEY },
    timeout: 15000,
  });
  return response.data;
}

export async function getHistoricalSp500Changes(): Promise<unknown> {
  if (!FMP_API_KEY) throw new Error('FINANCIAL_MODELING_PREP_API_KEY not configured');
  return fmpGet('/historical-sp500-constituent', {});
}

// FMP numeric fields can arrive as numbers, numeric strings, or null.
function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

// profile.range is a "low-high" string like "164.08-199.62". A split on the
// last '-' handles the format safely even if the low is negative.
function parse52WeekRange(range: unknown): { high: number | null; low: number | null } {
  if (typeof range !== 'string') return { high: null, low: null };
  const idx = range.lastIndexOf('-');
  if (idx <= 0) return { high: null, low: null };
  const low = num(range.slice(0, idx));
  const high = num(range.slice(idx + 1));
  return { high, low };
}

/**
 * Fetch stock fundamentals + price from Financial Modeling Prep (stable API).
 * Uses four endpoints, all keyed by ?symbol=:
 *   - /profile          — price, name, market cap, beta, 52-week range
 *   - /ratios-ttm       — P/E, D/E, current ratio, margins, price-to-FCF (TTM)
 *   - /key-metrics-ttm  — ROE, FCF yield (TTM)
 *   - /income-statement — last two annual statements for growth rates + EPS
 * Only the profile is mandatory; the other three degrade to safe defaults
 * (matching the other adapters' pattern) when unavailable on the free tier.
 */
export async function getFmpData(symbol: string): Promise<StockResponse> {
  console.log(`Fetching FMP data for ${symbol}`);

  if (!FMP_API_KEY) {
    throw new Error('FINANCIAL_MODELING_PREP_API_KEY not configured');
  }

  const [profileRaw, ratiosRaw, keyMetricsRaw, incomeRaw] = await Promise.all([
    fmpGet('/profile', { symbol }),
    fmpGet('/ratios-ttm', { symbol }).catch(() => null),
    fmpGet('/key-metrics-ttm', { symbol }).catch(() => null),
    fmpGet('/income-statement', { symbol, limit: '2' }).catch(() => null),
  ]);

  // FMP returns [] for unknown symbols and { "Error Message": ... } for
  // key/plan problems.
  if (!Array.isArray(profileRaw) || profileRaw.length === 0) {
    const upstreamError =
      profileRaw && typeof profileRaw === 'object' && 'Error Message' in profileRaw
        ? ` (${(profileRaw as any)['Error Message']})`
        : '';
    throw new Error(`FMP: no data found for symbol "${symbol}"${upstreamError}`);
  }

  const profile = profileRaw[0] ?? {};
  const ratios = Array.isArray(ratiosRaw) && ratiosRaw.length > 0 ? ratiosRaw[0] : {};
  const km = Array.isArray(keyMetricsRaw) && keyMetricsRaw.length > 0 ? keyMetricsRaw[0] : {};
  const income: any[] = Array.isArray(incomeRaw) ? incomeRaw : [];
  const latestIncome = income[0] ?? {};
  const priorIncome = income[1] ?? {};

  const appliedAdjustments: string[] = [];

  const price = num(profile.price) ?? 0;

  const peRatio = num(ratios.priceToEarningsRatioTTM) ?? 0;

  // EPS waterfall: derived from price ÷ TTM P/E (gives TTM EPS) →
  // latest annual diluted EPS from the income statement.
  let eps = 0;
  if (peRatio > 0 && price > 0) {
    eps = Math.round((price / peRatio) * 10000) / 10000;
    appliedAdjustments.push('EPS derived from price ÷ TTM P/E');
  } else {
    eps = num(latestIncome.epsDiluted) ?? num(latestIncome.eps) ?? 0;
    if (eps !== 0) appliedAdjustments.push('EPS from latest annual income statement');
  }

  // FCF per share waterfall: price ÷ price-to-FCF (TTM) → FCF-yield × price →
  // conservative EPS-based estimate (positive EPS only).
  let fcfPerShare = 0;
  const priceToFcf = num(ratios.priceToFreeCashFlowRatioTTM);
  const fcfYieldRaw = num(km.freeCashFlowYieldTTM);
  if (priceToFcf !== null && priceToFcf > 0 && price > 0) {
    fcfPerShare = Math.round((price / priceToFcf) * 10000) / 10000;
  } else if (fcfYieldRaw !== null && price > 0) {
    fcfPerShare = Math.round(fcfYieldRaw * price * 10000) / 10000;
  } else if (eps > 0) {
    fcfPerShare = eps * 0.85;
    appliedAdjustments.push('FCF estimated as 0.85 × EPS');
  }

  const roe = (num(km.returnOnEquityTTM) ?? 0) * 100;
  const debtToEquity = num(ratios.debtToEquityRatioTTM) ?? 0.5;
  const currentRatio = num(ratios.currentRatioTTM) ?? num(km.currentRatioTTM) ?? 1.5;

  // Growth rates from the last two annual income statements.
  const revenueLatest = num(latestIncome.revenue);
  const revenuePrior = num(priorIncome.revenue);
  const revenueGrowth =
    revenueLatest !== null && revenuePrior !== null && revenuePrior !== 0
      ? ((revenueLatest - revenuePrior) / Math.abs(revenuePrior)) * 100
      : 0;

  const netIncomeLatest = num(latestIncome.netIncome);
  const netIncomePrior = num(priorIncome.netIncome);
  const earningsGrowth =
    netIncomeLatest !== null && netIncomePrior !== null && netIncomePrior > 0
      ? ((netIncomeLatest - netIncomePrior) / netIncomePrior) * 100
      : 0;
  const growthRate = earningsGrowth || revenueGrowth || 0;

  // EBITDA growth for the multibagger investment-affordability chip.
  const ebitdaLatest = num(latestIncome.ebitda);
  const ebitdaPrior = num(priorIncome.ebitda);
  const ebitdaGrowth =
    ebitdaLatest !== null && ebitdaPrior !== null && ebitdaPrior > 0
      ? ((ebitdaLatest - ebitdaPrior) / ebitdaPrior) * 100
      : null;

  // Margins (TTM fractions) for the stability / competitive-position
  // heuristics; fall back to annual income-statement computation.
  let profitMargin = num(ratios.netProfitMarginTTM) ?? 0;
  if (profitMargin === 0 && netIncomeLatest !== null && revenueLatest !== null && revenueLatest > 0) {
    profitMargin = netIncomeLatest / revenueLatest;
  }
  let operatingMargin = num(ratios.operatingProfitMarginTTM) ?? 0;
  const operatingIncomeLatest = num(latestIncome.operatingIncome);
  if (operatingMargin === 0 && operatingIncomeLatest !== null && revenueLatest !== null && revenueLatest > 0) {
    operatingMargin = operatingIncomeLatest / revenueLatest;
  }
  // Gross margin for VMS scoring. FMP returns this as a TTM fraction (0–1).
  const grossMarginRaw = num(ratios.grossProfitMarginTTM);
  const grossMargin = grossMarginRaw !== null && Number.isFinite(grossMarginRaw) ? grossMarginRaw : null;
  // Retain the computed operating margin for VMS scoring (null when not available).
  const operatingMarginResult = operatingMargin !== 0 ? operatingMargin : null;
  const beta = num(profile.beta) ?? 1;

  // Same classification heuristics as the Alpha Vantage adapter, so the
  // qualitative fields stay consistent regardless of which tier answered.
  let earningsStability: 'High' | 'Medium' | 'Low';
  if (beta < 0.8 && profitMargin > 0.15) earningsStability = 'High';
  else if (beta < 1.3 && profitMargin > 0.05) earningsStability = 'Medium';
  else earningsStability = 'Low';

  let competitivePosition: 'Strong' | 'Good' | 'Average';
  if (roe > 20 && operatingMargin > 0.15) competitivePosition = 'Strong';
  else if (roe > 12 && operatingMargin > 0.08) competitivePosition = 'Good';
  else competitivePosition = 'Average';

  const marketCapRaw = num(profile.marketCap);
  const marketCap = marketCapRaw !== null && marketCapRaw > 0 ? marketCapRaw : null;

  // FCF yield (percent) for the verdict's cash-quality gate. FMP exposes it
  // directly as a TTM fraction; fall back to FCF/share ÷ price.
  let fcfYield: number | null = null;
  if (fcfYieldRaw !== null) {
    fcfYield = fcfYieldRaw * 100;
  } else if (fcfPerShare !== 0 && price > 0) {
    fcfYield = (fcfPerShare / price) * 100;
  }

  const { high: week52High, low: week52Low } = parse52WeekRange(profile.range);

  const result: StockResponse = {
    symbol: profile.symbol || symbol,
    name: profile.companyName || symbol,
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
    ...(appliedAdjustments.length > 0 ? { appliedAdjustments } : {}),
    // FMP's historical ratio endpoints are outside the free-tier call
    // budget for this adapter; emit explicit null (Task #15 contract).
    peHistory: null,
    multibaggerSignals: {
      fcfYield,
      // Balance-sheet fetch would cost a 5th call per ticker; omit.
      assetGrowth: null,
      ebitdaGrowth,
      week52High,
      week52Low,
    },
    marketCap,
    grossMargin,
    operatingMargin: operatingMarginResult,
  };

  console.log(`FMP data for ${symbol}: price=${price}, eps=${eps}, roe=${roe.toFixed(1)}%, growth=${growthRate.toFixed(1)}%`);
  return result;
}

// ---------------------------------------------------------------------------
// Insider trading data (Task #74)
//
// Fetches the last 20 Form 4 filings from FMP's /stable/insider-trading
// endpoint. Returns an empty array when the API key is absent or the
// request fails — callers treat an empty array as "no data available"
// rather than an error.
// ---------------------------------------------------------------------------
import { InsiderTrade } from '@shared/schema';

export async function getInsiderTrades(symbol: string): Promise<InsiderTrade[]> {
  if (!FMP_API_KEY) return [];
  try {
    const raw = await fmpGet('/insider-trading', { symbol, limit: '20' });
    if (!Array.isArray(raw)) return [];

    return raw
      .map((t: any): InsiderTrade => ({
        reportingName: String(t.reportingName ?? '').trim(),
        typeOfOwner: String(t.typeOfOwner ?? '').trim(),
        transactionDate: String(t.transactionDate ?? '').trim(),
        transactionType: String(t.transactionType ?? '').trim(),
        securitiesTransacted: num(t.securitiesTransacted) ?? 0,
        price: num(t.price) ?? 0,
      }))
      .filter(t => t.transactionDate.length > 0);
  } catch (err) {
    console.warn(`FMP insider-trading fetch failed for ${symbol}:`, (err as Error).message);
    return [];
  }
}
