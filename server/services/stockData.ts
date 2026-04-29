import { StockResponse, DataSource, CrossSourceDivergence } from '@shared/schema';
import { getYahooFinanceData } from './yahooFinance';
import { getRapidApiStockData } from './rapidApiFinance';
import { getAlphaVantageData } from './alphaVantage';
import { scrapeStockData } from './webScraper';
import { getFallbackStockData } from './fallbackData';

// ---------------------------------------------------------------------------
// Cross-source agreement gate
// When a primary source returns complete data we kick off a *non-blocking*
// secondary fetch to spot-check it. Any field that diverges by more than
// CROSS_SOURCE_DIVERGENCE_PCT is logged as a structured warn so operators
// can see (and `npm run verify` can grep for) data-quality issues.
// ---------------------------------------------------------------------------
const CROSS_SOURCE_DIVERGENCE_PCT = 15;
const COMPARABLE_FIELDS: Array<keyof StockResponse> = [
  'price', 'eps', 'peRatio', 'fcfPerShare', 'growthRate',
];

export interface CrossSourceDiscrepancy {
  symbol: string;
  primarySource: DataSource;
  secondarySource: DataSource;
  field: string;
  primary: number;
  secondary: number;
  deltaPct: number;
}

/**
 * Compare two payloads field-by-field. Returns the list of fields that
 * disagree by more than `tolerancePct` percent.
 *
 * Exported so tests can exercise the exact production divergence math.
 */
export function diffPayloads(
  primary: StockResponse,
  secondary: StockResponse,
  primarySource: DataSource,
  secondarySource: DataSource,
  tolerancePct = CROSS_SOURCE_DIVERGENCE_PCT,
): CrossSourceDiscrepancy[] {
  const out: CrossSourceDiscrepancy[] = [];
  for (const field of COMPARABLE_FIELDS) {
    const va = primary[field] as unknown as number;
    const vb = secondary[field] as unknown as number;
    if (typeof va !== 'number' || typeof vb !== 'number') continue;
    if (!va || !vb) continue; // skip missing/zero on either side
    const denom = Math.max(Math.abs(va), Math.abs(vb));
    const deltaPct = denom === 0 ? 0 : (Math.abs(va - vb) / denom) * 100;
    if (deltaPct > tolerancePct) {
      out.push({
        symbol: primary.symbol,
        primarySource,
        secondarySource,
        field: String(field),
        primary: va,
        secondary: vb,
        deltaPct: parseFloat(deltaPct.toFixed(2)),
      });
    }
  }
  return out;
}

function logDiscrepancies(diffs: CrossSourceDiscrepancy[]): void {
  for (const d of diffs) {
    // Single-line, structured, easy to grep with: rg 'CROSS_SOURCE_DIVERGENCE'
    console.warn(
      `CROSS_SOURCE_DIVERGENCE symbol=${d.symbol} field=${d.field} ` +
      `${d.primarySource}=${d.primary} ${d.secondarySource}=${d.secondary} ` +
      `delta=${d.deltaPct}%`
    );
  }
}

// Convert the internal discrepancy list into the user-facing payload that the
// UI renders inside the "Sources disagree" chip.
function buildDivergencePayload(
  diffs: CrossSourceDiscrepancy[],
  sourceA: DataSource,
  sourceB: DataSource,
): CrossSourceDivergence {
  return {
    checkedAt: new Date().toISOString(),
    sourceA,
    sourceB,
    fields: diffs.map((d) => ({
      field: d.field,
      valueA: d.primary,
      valueB: d.secondary,
      deltaPct: d.deltaPct,
    })),
  };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
interface StockCacheEntry {
  data: StockResponse;
  timestamp: number;
  // Latest cross-source spot-check result for this symbol.
  // `null` = check ran and the sources agreed within tolerance.
  // `undefined` = no spot-check has run yet.
  divergence?: CrossSourceDivergence | null;
}
const stockDataCache: { [symbol: string]: StockCacheEntry } = {};
const CACHE_DURATION = 20 * 60 * 1000; // 20 minutes

// Background spot-check promises, exposed to tests so they can deterministically
// wait for fire-and-forget agreement checks before asserting on cache state.
const inFlightSpotChecks: Set<Promise<void>> = new Set();

// Test helpers — never used by production code paths.
export async function __awaitPendingSpotChecks(): Promise<void> {
  await Promise.allSettled(Array.from(inFlightSpotChecks));
}
export function __resetStockDataCache(): void {
  for (const key of Object.keys(stockDataCache)) delete stockDataCache[key];
}
// Push a cached entry's timestamp far enough into the past that the next
// fetch is treated as a cache miss. Lets tests deterministically exercise
// the "all live sources fail → fallback against cached primary" path.
export function __expireStockDataCache(symbol: string): void {
  const entry = stockDataCache[symbol];
  if (entry) entry.timestamp = 0;
}

// Build the response payload that gets returned to the client, attaching the
// most recent divergence finding (if any) from the cache entry.
function attachDivergence(symbol: string, data: StockResponse): StockResponse {
  const div = stockDataCache[symbol]?.divergence;
  return { ...data, crossSourceDivergence: div ?? null };
}

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
// Each derivation also appends a human-readable note to `appliedAdjustments`
// so the UI can surface exactly what was filled in vs. fetched directly.
// ---------------------------------------------------------------------------
function deriveMetrics(data: StockResponse): StockResponse {
  const d: StockResponse = { ...data, appliedAdjustments: [...(data.appliedAdjustments ?? [])] };
  const log = (msg: string) => d.appliedAdjustments!.push(msg);

  // 1. EPS from P/E ratio
  if ((!d.eps || d.eps === 0) && d.peRatio > 0 && d.price > 0) {
    d.eps = parseFloat((d.price / d.peRatio).toFixed(4));
    log(`EPS derived from price ÷ P/E (${d.price} / ${d.peRatio} = ${d.eps})`);
    console.log(`  Derived EPS for ${d.symbol}: ${d.eps} (price=${d.price} / PE=${d.peRatio})`);
  }

  // 2. P/E from EPS
  if ((!d.peRatio || d.peRatio === 0) && d.eps > 0 && d.price > 0) {
    d.peRatio = parseFloat((d.price / d.eps).toFixed(2));
    log(`P/E derived from price ÷ EPS (= ${d.peRatio})`);
  }

  // 3. FCF per share from EPS (conservative 75% proxy)
  if ((!d.fcfPerShare || d.fcfPerShare === 0) && d.eps > 0) {
    d.fcfPerShare = parseFloat((d.eps * 0.75).toFixed(4));
    log(`FCF/share estimated as EPS × 0.75 (= ${d.fcfPerShare})`);
    console.log(`  Derived FCF/share for ${d.symbol}: ${d.fcfPerShare} (EPS × 0.75)`);
  }

  // 4. Growth rate: prefer earnings growth, fall back to revenue growth,
  //    then a conservative long-run baseline of 8%
  if (!d.growthRate || d.growthRate === 0) {
    if (d.revenueGrowth && d.revenueGrowth !== 0) {
      d.growthRate = d.revenueGrowth;
      log(`Growth rate filled from revenue growth (${d.revenueGrowth}%)`);
      console.log(`  Derived growthRate for ${d.symbol}: ${d.growthRate} (from revenueGrowth)`);
    } else {
      d.growthRate = 8; // long-run nominal baseline
      log(`Growth rate missing — using long-run baseline of 8%`);
      console.log(`  Using baseline growthRate=8 for ${d.symbol}`);
    }
  }

  // 5. ROE fallback
  if (!d.roe || d.roe === 0) {
    d.roe = 10; // neutral baseline
    log(`ROE missing — using neutral baseline of 10%`);
  }

  return d;
}

// Stamp a payload with provenance metadata before it is cached/returned.
function stampProvenance(data: StockResponse, source: DataSource): StockResponse {
  return {
    ...data,
    dataSource: source,
    fetchedAt: new Date().toISOString(),
    appliedAdjustments: data.appliedAdjustments ?? [],
  };
}

// ---------------------------------------------------------------------------
// Core fetch logic
// ---------------------------------------------------------------------------
async function _fetchStockData(symbol: string): Promise<StockResponse> {
  const now = Date.now();

  // Serve from cache if still fresh
  if (stockDataCache[symbol] && now - stockDataCache[symbol].timestamp < CACHE_DURATION) {
    console.log(`Returning cached data for ${symbol}`);
    return attachDivergence(symbol, stockDataCache[symbol].data);
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

  // Fire-and-forget secondary fetch to spot-check the primary. Runs in the
  // background so it never blocks the user's request, but the result is
  // captured into the cache entry so the *next* response can surface it.
  function spotCheck(
    primary: StockResponse,
    primarySource: DataSource,
    secondarySource: DataSource,
    fetcher: () => Promise<StockResponse>,
  ): void {
    let p: Promise<void>;
    p = fetcher()
      .then((raw) => {
        const secondary = deriveMetrics(raw);
        if (!isDataComplete(secondary)) return;
        const diffs = diffPayloads(primary, secondary, primarySource, secondarySource);
        if (diffs.length > 0) logDiscrepancies(diffs);
        const entry = stockDataCache[symbol];
        if (!entry) return;
        // Always record the result so a previously-flagged divergence can
        // be cleared when the next check finds agreement.
        entry.divergence =
          diffs.length > 0
            ? buildDivergencePayload(diffs, primarySource, secondarySource)
            : null;
      })
      .catch(() => { /* secondary failures are non-fatal */ })
      .finally(() => { inFlightSpotChecks.delete(p); });
    inFlightSpotChecks.add(p);
  }

  // Compare a fallback's output against the most recent cached primary
  // (if any, even if expired). This is the "fallback succeeded after primary
  // failure" agreement check — it surfaces when a downgrade source is
  // returning numbers materially different from what we last knew.
  // Returns the divergence payload so the caller can attach it to the new
  // cache entry it's about to write.
  const cached = stockDataCache[symbol]?.data;
  function compareWithCachedPrimary(
    secondary: StockResponse,
    secondarySource: DataSource,
  ): CrossSourceDivergence | null {
    if (!cached || !cached.dataSource || cached.dataSource === secondarySource) return null;
    const diffs = diffPayloads(cached, secondary, cached.dataSource, secondarySource);
    if (diffs.length > 0) {
      logDiscrepancies(diffs);
      return buildDivergencePayload(diffs, cached.dataSource, secondarySource);
    }
    return null;
  }

  // --- 1. yfinance (Python — most reliable for broad symbol coverage) ---
  const yfinanceResult = await trySource('yfinance', () => fetchYfinanceWithQueue(symbol));
  if (yfinanceResult) {
    const stamped = stampProvenance(yfinanceResult, 'yfinance');
    const divergence = compareWithCachedPrimary(stamped, 'yfinance');
    stockDataCache[symbol] = { data: stamped, timestamp: now, divergence };
    spotCheck(stamped, 'yfinance', 'rapidapi', () => getRapidApiStockData(symbol));
    return attachDivergence(symbol, stamped);
  }

  // --- 2. RapidAPI ---
  const rapidResult = await trySource('RapidAPI', () => getRapidApiStockData(symbol));
  if (rapidResult) {
    const stamped = stampProvenance(rapidResult, 'rapidapi');
    const divergence = compareWithCachedPrimary(stamped, 'rapidapi');
    stockDataCache[symbol] = { data: stamped, timestamp: now, divergence };
    spotCheck(stamped, 'rapidapi', 'alphavantage', () => getAlphaVantageData(symbol));
    return attachDivergence(symbol, stamped);
  }

  // --- 3. Alpha Vantage (dedicated fundamentals API) ---
  const avResult = await trySource('Alpha Vantage', () => getAlphaVantageData(symbol));
  if (avResult) {
    const stamped = stampProvenance(avResult, 'alphavantage');
    const divergence = compareWithCachedPrimary(stamped, 'alphavantage');
    stockDataCache[symbol] = { data: stamped, timestamp: now, divergence };
    spotCheck(stamped, 'alphavantage', 'rapidapi', () => getRapidApiStockData(symbol));
    return attachDivergence(symbol, stamped);
  }

  // --- 4. Web scraping ---
  const scrapeResult = await trySource('web scraping', () => scrapeStockData(symbol));
  if (scrapeResult) {
    const stamped = stampProvenance(scrapeResult, 'scraper');
    const divergence = compareWithCachedPrimary(stamped, 'scraper');
    stockDataCache[symbol] = { data: stamped, timestamp: now, divergence };
    return attachDivergence(symbol, stamped);
  }

  // --- 5. Static fallback (5 common stocks) ---
  const fallbackData = getFallbackStockData(symbol);
  if (fallbackData) {
    const derived = deriveMetrics(fallbackData);
    const stamped = stampProvenance(derived, 'fallback');
    console.log(`[${symbol}] Using static fallback data`);
    // Compare the downgrade against the most recent cached primary — if the
    // static numbers are materially out of sync with the last live fetch,
    // surface that on the response so the user knows the figures are stale.
    const divergence = compareWithCachedPrimary(stamped, 'fallback');
    // Cache as if it expired 15 minutes ago, so a real source is retried sooner.
    stockDataCache[symbol] = { data: stamped, timestamp: now - (15 * 60 * 1000), divergence };
    return attachDivergence(symbol, stamped);
  }

  // --- All sources exhausted ---
  console.log(`[${symbol}] All data sources exhausted — returning error response`);
  return stampProvenance({
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
  } as StockResponse, 'unknown');
}

// ---------------------------------------------------------------------------
// Cross-source agreement check (utility, not yet wired into hot path).
// Used by the verification suite (`npm run verify`) to spot-check that two
// independent sources agree on the headline numbers within a tolerance.
// ---------------------------------------------------------------------------
export async function fetchFromAllSources(symbol: string): Promise<{
  yfinance: StockResponse | null;
  rapidapi: StockResponse | null;
  alphaVantage: StockResponse | null;
}> {
  const [y, r, a] = await Promise.allSettled([
    fetchYfinanceWithQueue(symbol),
    getRapidApiStockData(symbol),
    getAlphaVantageData(symbol),
  ]);
  return {
    yfinance: y.status === 'fulfilled' && isDataComplete(y.value) ? deriveMetrics(y.value) : null,
    rapidapi: r.status === 'fulfilled' && isDataComplete(r.value) ? deriveMetrics(r.value) : null,
    alphaVantage: a.status === 'fulfilled' && isDataComplete(a.value) ? deriveMetrics(a.value) : null,
  };
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
