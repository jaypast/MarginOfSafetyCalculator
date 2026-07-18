import axios from 'axios';
import { StockResponse } from '@shared/schema';

// Financial Modeling Prep (FMP) adapter — tier between Alpha Vantage and the
// web scraper. FMP's key-metrics-ttm endpoint exposes the full fundamental
// set the calculators need (EPS, P/E, FCF/share, ROE, D/E, current ratio),
// which is exactly what mid/small-cap tickers are often missing from the
// higher tiers. Free tier: 250 calls/day (this adapter spends 3 per ticker).

const FMP_API_KEY = process.env.FINANCIAL_MODELING_PREP_API_KEY;
const BASE_URL = 'https://financialmodelingprep.com/api/v3';

if (!FMP_API_KEY) {
  console.warn('FINANCIAL_MODELING_PREP_API_KEY is not set. FMP fallback tier will be skipped.');
}

async function fmpGet(path: string): Promise<any> {
  const response = await axios.get(`${BASE_URL}${path}`, {
    params: { apikey: FMP_API_KEY },
    timeout: 15000,
  });
  return response.data;
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

// profile.range is a "low-high" string like "164.08-199.62". Symbols can
// legitimately have negative-free prices only, so a simple split on the
// last '-' handles the format safely.
function parse52WeekRange(range: unknown): { high: number | null; low: number | null } {
  if (typeof range !== 'string') return { high: null, low: null };
  const idx = range.lastIndexOf('-');
  if (idx <= 0) return { high: null, low: null };
  const low = num(range.slice(0, idx));
  const high = num(range.slice(idx + 1));
  return { high, low };
}

/**
 * Fetch stock fundamentals + price from Financial Modeling Prep.
 * Uses three v3 endpoints:
 *   - /profile/{symbol}          — price, name, market cap, beta, 52-week range
 *   - /key-metrics-ttm/{symbol}  — EPS, P/E, FCF/share, ROE, D/E, current ratio (TTM)
 *   - /income-statement/{symbol} — last two annual statements for growth rates
 */
export async function getFmpData(symbol: string): Promise<StockResponse> {
  console.log(`Fetching FMP data for ${symbol}`);

  if (!FMP_API_KEY) {
    throw new Error('FINANCIAL_MODELING_PREP_API_KEY not configured');
  }

  const encoded = encodeURIComponent(symbol);
  const [profileRaw, keyMetricsRaw, incomeRaw] = await Promise.all([
    fmpGet(`/profile/${encoded}`),
    fmpGet(`/key-metrics-ttm/${encoded}`).catch(() => null),
    fmpGet(`/income-statement/${encoded}?limit=2`).catch(() => null),
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
  const km = Array.isArray(keyMetricsRaw) && keyMetricsRaw.length > 0 ? keyMetricsRaw[0] : {};
  const income: any[] = Array.isArray(incomeRaw) ? incomeRaw : [];
  const latestIncome = income[0] ?? {};
  const priorIncome = income[1] ?? {};

  const appliedAdjustments: string[] = [];

  const price = num(profile.price) ?? 0;

  // EPS waterfall: TTM net income per share → latest annual diluted EPS →
  // derived from price ÷ P/E.
  let eps = num(km.netIncomePerShareTTM) ?? 0;
  if (eps === 0) {
    eps = num(latestIncome.epsdiluted) ?? num(latestIncome.eps) ?? 0;
    if (eps !== 0) appliedAdjustments.push('EPS from latest annual income statement (TTM unavailable)');
  }
  let peRatio = num(km.peRatioTTM) ?? 0;
  if (peRatio === 0 && eps > 0 && price > 0) {
    peRatio = Math.round((price / eps) * 100) / 100;
    appliedAdjustments.push('P/E derived from price ÷ EPS');
  }

  // FCF per share: TTM figure preferred; EPS-based estimate (positive EPS
  // only) as the conservative fallback used by the other adapters.
  let fcfPerShare = num(km.freeCashFlowPerShareTTM) ?? 0;
  if (fcfPerShare === 0 && eps > 0) {
    fcfPerShare = eps * 0.85;
    appliedAdjustments.push('FCF estimated as 0.85 × EPS');
  }

  const roe = (num(km.roeTTM) ?? 0) * 100;
  const debtToEquity = num(km.debtToEquityTTM) ?? 0.5;
  const currentRatio = num(km.currentRatioTTM) ?? 1.5;

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

  // Margins for the stability / competitive-position heuristics.
  const profitMargin =
    netIncomeLatest !== null && revenueLatest !== null && revenueLatest > 0
      ? netIncomeLatest / revenueLatest
      : 0;
  const operatingIncomeLatest = num(latestIncome.operatingIncome);
  const operatingMargin =
    operatingIncomeLatest !== null && revenueLatest !== null && revenueLatest > 0
      ? operatingIncomeLatest / revenueLatest
      : 0;
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

  const marketCapRaw = num(profile.mktCap);
  const marketCap = marketCapRaw !== null && marketCapRaw > 0 ? marketCapRaw : null;

  // FCF yield (percent) for the verdict's cash-quality gate. FMP exposes it
  // directly as a ratio; fall back to FCF/share ÷ price.
  let fcfYield: number | null = null;
  const fcfYieldRaw = num(km.freeCashFlowYieldTTM);
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
      // Balance-sheet fetch would cost a 4th call per ticker; omit.
      assetGrowth: null,
      ebitdaGrowth,
      week52High,
      week52Low,
    },
    marketCap,
  };

  console.log(`FMP data for ${symbol}: price=${price}, eps=${eps}, roe=${roe.toFixed(1)}%, growth=${growthRate.toFixed(1)}%`);
  return result;
}
