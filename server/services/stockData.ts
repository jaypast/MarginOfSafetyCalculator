import { StockResponse, DataSource, CrossSourceDivergence, FundamentalsCacheRow } from '@shared/schema';
import { getYahooFinanceData } from './yahooFinance';
import { getRapidApiStockData } from './rapidApiFinance';
import { getAlphaVantageData } from './alphaVantage';
import { getFmpData } from './fmpFinance';
import { scrapeStockData, getQuickPrice } from './webScraper';
import { getFallbackStockData } from './fallbackData';
import { storage } from '../storage';

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
// When a lower-priority source succeeds while a higher-priority source is
// still in flight, wait at most this long for the higher tier before
// returning the lower-tier result. Exported for tests.
export const PRIMARY_SOURCE_GRACE_MS = 400;

// ---------------------------------------------------------------------------
// Persistent fundamentals cache tiers (Task #58)
// Fundamentals only move quarterly, so a lookup within FUNDAMENTALS_TTL_MS
// of the last complete live fetch needs just a cheap price refresh. The
// faster-drifting 52-week range is only served within RANGE_TTL_MS, and
// historical P/E medians within PE_HISTORY_TTL_MS (only relevant on the
// stale-serve path, since a normal hit is already inside the 7-day window).
// ---------------------------------------------------------------------------
export const FUNDAMENTALS_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days
export const RANGE_TTL_MS        = 24 * 60 * 60 * 1000;      // 1 day
export const PE_HISTORY_TTL_MS   = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Rebuild a servable payload from cached fundamentals + a price.
 *
 * Price-derived fields are recomputed so they are never stale:
 *   - peRatio  = price ÷ cached EPS
 *   - marketCap scaled by the price ratio (share count is fixed short-term)
 *   - fcfYield scaled inversely by the price ratio (FCF is fixed short-term)
 * Tier expiry: the 52-week range is dropped past RANGE_TTL_MS and the
 * historical P/E block past PE_HISTORY_TTL_MS, with explicit notes.
 * Provenance stays honest: the original dataSource badge is kept and
 * `fetchedAt` reflects when the fundamentals were actually fetched.
 *
 * Exported so tests can exercise the exact production recombination math.
 */
export function recombineCachedFundamentals(
  cached: StockResponse,
  fetchedAt: Date,
  price: number,
  opts: { priceIsLive: boolean; note: string },
  now: number = Date.now(),
): StockResponse {
  const age = now - fetchedAt.getTime();
  const d: StockResponse = {
    ...cached,
    appliedAdjustments: [...(cached.appliedAdjustments ?? []), opts.note],
    multibaggerSignals: cached.multibaggerSignals ? { ...cached.multibaggerSignals } : cached.multibaggerSignals,
  };
  const oldPrice = cached.price;

  if (opts.priceIsLive && price > 0) {
    d.price = Math.round(price * 100) / 100;
    if (d.eps > 0) {
      d.peRatio = Math.round((price / d.eps) * 100) / 100;
    }
    if (typeof d.marketCap === 'number' && d.marketCap > 0 && oldPrice > 0) {
      d.marketCap = Math.round(d.marketCap * (price / oldPrice));
    }
    if (d.multibaggerSignals && d.multibaggerSignals.fcfYield != null && oldPrice > 0) {
      d.multibaggerSignals.fcfYield = parseFloat(
        (d.multibaggerSignals.fcfYield * (oldPrice / price)).toFixed(4),
      );
    }
  }

  if (age > RANGE_TTL_MS && d.multibaggerSignals &&
      (d.multibaggerSignals.week52High != null || d.multibaggerSignals.week52Low != null)) {
    d.multibaggerSignals = { ...d.multibaggerSignals, week52High: null, week52Low: null };
    d.appliedAdjustments!.push('52-week range omitted — cached copy is older than 1 day');
  }
  if (age > PE_HISTORY_TTL_MS && d.peHistory) {
    d.peHistory = null;
    d.appliedAdjustments!.push('Historical P/E omitted — cached copy is older than 30 days');
  }

  // Honest provenance: original source badge, true fundamentals age.
  d.fetchedAt = fetchedAt.toISOString();
  return d;
}

// Fire-and-forget write-through: persist every complete live payload so the
// next lookup (or the next server process) can serve it with just a price
// refresh. Failures are logged and never affect the response.
function persistFundamentals(symbol: string, stamped: StockResponse): void {
  storage
    .upsertFundamentalsCache(symbol, stamped, stamped.dataSource ?? 'unknown', new Date())
    .catch((err) => console.error(`[${symbol}] Failed to persist fundamentals cache:`, err));
}

// Background spot-check promises, exposed to tests so they can deterministically
// wait for fire-and-forget agreement checks before asserting on cache state.
const inFlightSpotChecks: Set<Promise<void>> = new Set();

// Tracks symbols whose background stale-while-revalidate refresh is in progress,
// or queued, so we don't stack duplicate refreshes for the same symbol.
const pendingBackgroundRefreshes = new Set<string>();
// Keep background work below the yfinance limit of 3, leaving capacity for a
// user-initiated lookup even when stale cache entries arrive in a burst.
export const MAX_CONCURRENT_BACKGROUND_REFRESHES = 2;
let activeBackgroundRefreshes = 0;
const backgroundRefreshQueue: Array<() => void> = [];

function drainBackgroundRefreshQueue(): void {
  while (
    activeBackgroundRefreshes < MAX_CONCURRENT_BACKGROUND_REFRESHES &&
    backgroundRefreshQueue.length > 0
  ) {
    activeBackgroundRefreshes++;
    backgroundRefreshQueue.shift()!();
  }
}

function scheduleBackgroundRefresh(symbol: string): void {
  if (pendingBackgroundRefreshes.has(symbol)) return;
  pendingBackgroundRefreshes.add(symbol);

  let refreshP: Promise<void>;
  refreshP = new Promise<void>((resolve) => {
    backgroundRefreshQueue.push(() => {
      _fetchStockData(symbol, true)
        .then((fresh) => console.log(`[${symbol}] Background refresh completed via ${fresh.dataSource}`))
        .catch((err) => console.log(`[${symbol}] Background refresh failed: ${err}`))
        .finally(() => {
          activeBackgroundRefreshes--;
          pendingBackgroundRefreshes.delete(symbol);
          drainBackgroundRefreshQueue();
          resolve();
        });
    });
    drainBackgroundRefreshQueue();
  }).finally(() => {
    inFlightSpotChecks.delete(refreshP);
  });
  // Track the full queued + running lifecycle so test/process waiters do not
  // mistake queued work for completed work.
  inFlightSpotChecks.add(refreshP);
}

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

export function acquireYfinanceSlot(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('yfinance request aborted'));
      return;
    }

    let queued = true;
    let start: () => void;
    const onAbort = () => {
      if (!queued) return;
      const index = yfinanceQueue.indexOf(start);
      if (index >= 0) yfinanceQueue.splice(index, 1);
      queued = false;
      reject(new Error('yfinance request aborted'));
    };

    start = () => {
      if (!queued) return;
      queued = false;
      signal?.removeEventListener('abort', onAbort);
      activeYfinanceCalls++;
      resolve();
    };

    if (activeYfinanceCalls < MAX_CONCURRENT_YFINANCE) {
      start();
    } else {
      yfinanceQueue.push(start);
      signal?.addEventListener('abort', onAbort, { once: true });
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

async function fetchYfinanceWithQueue(symbol: string, signal?: AbortSignal): Promise<StockResponse> {
  await acquireYfinanceSlot(signal);
  try {
    return await getYahooFinanceData(symbol, signal);
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
// forceRefresh=true bypasses the in-memory and DB TTL checks (used by the
// stale-while-revalidate background refresh path).
// ---------------------------------------------------------------------------
async function _fetchStockData(symbol: string, forceRefresh = false): Promise<StockResponse> {
  const now = Date.now();

  // Serve from cache if still fresh (skipped during a background refresh)
  if (!forceRefresh && stockDataCache[symbol] && now - stockDataCache[symbol].timestamp < CACHE_DURATION) {
    console.log(`Returning cached data for ${symbol}`);
    return attachDivergence(symbol, stockDataCache[symbol].data);
  }

  // --- Persistent fundamentals cache (Task #58) ---
  // Fetched once here; also reused by the stale-serve branch below if every
  // live source fails. Lookup failures are non-fatal — the live chain is
  // always available as the fallback path.
  let dbCached: FundamentalsCacheRow | undefined;
  try {
    dbCached = await storage.getFundamentalsCache(symbol);
  } catch (err) {
    console.error(`[${symbol}] Fundamentals cache lookup failed:`, err);
  }
  if (dbCached && !dbCached.payload?.error) {
    const fetchedAtDate = new Date(dbCached.fetchedAt);
    const age = now - fetchedAtDate.getTime();

    // Normal DB cache hit: within TTL, serve immediately with a fresh price.
    // Skip during a background refresh so we always reach the live sources.
    if (!forceRefresh && age < FUNDAMENTALS_TTL_MS) {
      try {
        const freshPrice = await getQuickPrice(symbol);
        const combined = recombineCachedFundamentals(
          dbCached.payload,
          fetchedAtDate,
          freshPrice,
          {
            priceIsLive: true,
            note: `Fundamentals served from cache (fetched ${fetchedAtDate.toISOString()}); price refreshed live`,
          },
          now,
        );
        console.log(`[${symbol}] Serving cached fundamentals (${Math.round(age / (60 * 60 * 1000))}h old) with fresh live price`);
        stockDataCache[symbol] = {
          data: combined,
          timestamp: now,
          divergence: stockDataCache[symbol]?.divergence,
        };
        return attachDivergence(symbol, combined);
      } catch (err) {
        console.log(`[${symbol}] Quick price refresh failed — falling through to live sources: ${err}`);
      }
    }

    // Stale-while-revalidate window: DB cache is between 1× and 2× TTL.
    // Serve the stale-but-recent fundamentals immediately (with a fresh price),
    // then kick off a background refresh so the next in-memory miss gets live data.
    // Skip during a background refresh so we always reach live sources.
    if (!forceRefresh && age < FUNDAMENTALS_TTL_MS * 2) {
      try {
        const freshPrice = await getQuickPrice(symbol);
        const ageH = Math.round(age / (60 * 60 * 1000));
        const combined = recombineCachedFundamentals(
          dbCached.payload,
          fetchedAtDate,
          freshPrice,
          {
            priceIsLive: true,
            note: `Fundamentals ${ageH}h old — served immediately; background refresh in progress`,
          },
          now,
        );
        console.log(`[${symbol}] Stale-while-revalidate: fundamentals ${ageH}h old — serving immediately + scheduling background refresh`);
        // Short in-memory TTL (5 min) so the next miss triggers a live re-fetch
        stockDataCache[symbol] = {
          data: combined,
          timestamp: now - CACHE_DURATION + (5 * 60 * 1000),
          divergence: stockDataCache[symbol]?.divergence,
        };
        // Background refresh — forceRefresh=true bypasses cache checks so we
        // always hit the live sources rather than re-serving from the stale DB entry.
        // Note: pendingRequests still holds *this* request's symbol here, so it
        // cannot be used as a guard — pendingBackgroundRefreshes is the dedup.
        scheduleBackgroundRefresh(symbol);
        return attachDivergence(symbol, combined);
      } catch (err) {
        console.log(`[${symbol}] Stale-while-revalidate price refresh failed — falling through to live sources: ${err}`);
      }
    }
  }

  // Track the best live price seen across all sources even when fundamentals
  // are incomplete. Used to patch static fallback data so the price shown
  // is current even when EPS/FCF could not be fetched.
  let bestPartialPrice: number | null = null;

  // Helper: try a source, derive missing metrics, check quality gate
  async function trySource(
    label: string,
    fetcher: (signal?: AbortSignal) => Promise<StockResponse>,
    signal?: AbortSignal,
  ): Promise<StockResponse | null> {
    try {
      console.log(`[${symbol}] Trying ${label}...`);
      let data = await fetcher(signal);
      data = deriveMetrics(data);
      // Preserve any live price even if fundamentals are missing — used to
      // patch the static fallback price so users never see a years-old price.
      if (data.price > 0) {
        bestPartialPrice = data.price;
      }
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
    p = Promise.resolve()
      .then(fetcher)
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

  // --- 1–4. Primary sources — fired in parallel; first complete result wins ---
  // All four sources start simultaneously. The first one to return complete data
  // resolves the race; the losers continue running in the background (their only
  // side-effect is updating bestPartialPrice, which is harmless for the fallback
  // path). This replaces the previous serial waterfall where a slow or failing
  // first source added its full latency before the second was even attempted.
  interface PrimarySourceDef {
    label: string;
    source: DataSource;
    fetcher: (signal?: AbortSignal) => Promise<StockResponse>;
    spotCheckSource: DataSource;
    spotCheckFetcher: () => Promise<StockResponse>;
  }
  const primaryDefs: PrimarySourceDef[] = [
    { label: 'yfinance',      source: 'yfinance',     fetcher: (signal) => fetchYfinanceWithQueue(symbol, signal), spotCheckSource: 'rapidapi',     spotCheckFetcher: () => getRapidApiStockData(symbol) },
    { label: 'RapidAPI',      source: 'rapidapi',     fetcher: (signal) => getRapidApiStockData(symbol, signal),   spotCheckSource: 'alphavantage', spotCheckFetcher: () => getAlphaVantageData(symbol) },
    { label: 'Alpha Vantage', source: 'alphavantage', fetcher: (signal) => getAlphaVantageData(symbol, signal),   spotCheckSource: 'rapidapi',     spotCheckFetcher: () => getRapidApiStockData(symbol) },
    // FMP: fundamentals for mid/small-caps. Skipped gracefully (throws immediately)
    // when the API key is not configured.
    { label: 'FMP',           source: 'fmp',          fetcher: (signal) => getFmpData(symbol, signal),             spotCheckSource: 'rapidapi',     spotCheckFetcher: () => getRapidApiStockData(symbol) },
  ];

  // Start every source now (parallel) and select in completion order, with a
  // small priority preference: when a *lower*-priority source succeeds first
  // while a higher-priority source is still in flight, the higher tier gets a
  // short grace window (PRIMARY_SOURCE_GRACE_MS) to finish and win. This keeps
  // the deterministic quality preference (yfinance > RapidAPI > ...) for
  // near-simultaneous results, but a slow or hung yfinance call can no longer
  // hold a fast lower-tier result hostage — worst-case added latency is the
  // grace window, not the higher tier's full timeout.
  type PrimaryWin = { result: StockResponse; def: PrimarySourceDef };
  const primaryWinner = await new Promise<PrimaryWin | null>((resolve) => {
    const successes: (PrimaryWin | null)[] = primaryDefs.map(() => null);
    const settled: boolean[] = primaryDefs.map(() => false);
    let pending = primaryDefs.length;
    let done = false;
    let graceTimer: NodeJS.Timeout | null = null;
    const controllers = primaryDefs.map(() => new AbortController());

    const bestSettledSuccess = () => successes.find((s) => s !== null) ?? null;
    const finish = (w: PrimaryWin | null) => {
      if (done) return;
      done = true;
      if (graceTimer) clearTimeout(graceTimer);
      const winnerIndex = w ? primaryDefs.findIndex((def) => def === w.def) : -1;
      controllers.forEach((controller, index) => {
        if (index !== winnerIndex) controller.abort();
      });
      resolve(w);
    };

    primaryDefs.forEach((def, i) => {
      trySource(def.label, def.fetcher, controllers[i].signal)
        .catch(() => null)
        .then((result) => {
          if (done) return;
          settled[i] = true;
          pending--;
          if (result !== null) successes[i] = { result, def };
          const best = bestSettledSuccess();
          if (best) {
            const bestIdx = primaryDefs.findIndex((d) => d === best.def);
            const allHigherSettled = settled.slice(0, bestIdx).every(Boolean);
            if (allHigherSettled || pending === 0) {
              finish(best);
            } else if (!graceTimer) {
              // A lower tier succeeded while a higher tier is still running:
              // give the higher tier a bounded window to finish and win.
              graceTimer = setTimeout(() => finish(bestSettledSuccess()), PRIMARY_SOURCE_GRACE_MS);
            }
          } else if (pending === 0) {
            finish(null);
          }
        });
    });
  });

  if (primaryWinner) {
    const { result, def } = primaryWinner;
    const stamped = stampProvenance(result, def.source);
    const divergence = compareWithCachedPrimary(stamped, def.source);
    stockDataCache[symbol] = { data: stamped, timestamp: now, divergence };
    persistFundamentals(symbol, stamped);
    spotCheck(stamped, def.source, def.spotCheckSource, def.spotCheckFetcher);
    return attachDivergence(symbol, stamped);
  }

  // --- 5. Web scraping ---
  const scrapeResult = await trySource('web scraping', () => scrapeStockData(symbol));
  if (scrapeResult) {
    const stamped = stampProvenance(scrapeResult, 'scraper');
    const divergence = compareWithCachedPrimary(stamped, 'scraper');
    stockDataCache[symbol] = { data: stamped, timestamp: now, divergence };
    persistFundamentals(symbol, stamped);
    return attachDivergence(symbol, stamped);
  }

  // --- 6. Stale persistent cache (Task #58) ---
  // Every live source failed. Real fundamentals from a previous live fetch —
  // however old — beat the curated static dataset, so serve them before
  // falling back. The response keeps its true fetched-at timestamp and gets
  // an explicit note; the best partial live price (if any source returned
  // one) patches the cached price.
  if (dbCached && !dbCached.payload?.error) {
    const fetchedAtDate = new Date(dbCached.fetchedAt);
    const livePrice: number | null = (bestPartialPrice !== null && bestPartialPrice > 0)
      ? bestPartialPrice
      : null;
    const combined = recombineCachedFundamentals(
      dbCached.payload,
      fetchedAtDate,
      livePrice ?? dbCached.payload.price,
      {
        priceIsLive: livePrice !== null,
        note: livePrice !== null
          ? `All live sources failed — cached fundamentals (fetched ${fetchedAtDate.toISOString()}) combined with the latest live price`
          : `All live sources failed — serving cached fundamentals and price (fetched ${fetchedAtDate.toISOString()})`,
      },
      now,
    );
    console.log(`[${symbol}] All live sources failed — serving stale cached fundamentals from ${fetchedAtDate.toISOString()}`);
    const divergence = compareWithCachedPrimary(combined, (combined.dataSource ?? 'unknown') as DataSource);
    // Cache as if it expired 15 minutes ago so a live source is retried sooner.
    stockDataCache[symbol] = { data: combined, timestamp: now - (15 * 60 * 1000), divergence };
    return attachDivergence(symbol, combined);
  }

  // --- 7. Static fallback ---
  // Fundamentals (EPS, ROE, D/E, currentRatio) from the curated static
  // dataset are slow-moving and valid for months. The price, however, can
  // change dramatically. If any earlier source returned a valid live price
  // (even without full fundamentals), patch the static entry with it so
  // the user never sees a years-old stale price.
  const fallbackData = getFallbackStockData(symbol);
  if (fallbackData) {
    const patched = { ...fallbackData };
    // Explicit type annotation required: TypeScript cannot track closure-writes
    // to `bestPartialPrice` from inside `trySource`, so without the annotation
    // it infers the ternary as `null` and narrows to `never` inside the if-block.
    const livePrice: number | null = (bestPartialPrice !== null && bestPartialPrice > 0)
      ? bestPartialPrice
      : null;
    if (livePrice !== null) {
      const oldPrice = patched.price;
      patched.price = livePrice;
      // Recalculate P/E with the live price so the ratio stays coherent.
      const eps = patched.eps ?? 0;
      if (eps > 0) {
        patched.peRatio = Math.round((livePrice / eps) * 100) / 100;
      }
      // Round to 2dp for display without calling .toFixed() — TS can't narrow
      // bestPartialPrice through the closure so livePrice looks like `never` there.
      const livePriceRounded = Math.round(livePrice * 100) / 100;
      const adj = `Price updated from live source ($${oldPrice} → $${livePriceRounded}); fundamentals from static dataset`;
      patched.appliedAdjustments = [...(patched.appliedAdjustments ?? []), adj];
      console.log(`[${symbol}] Fallback: patching stale price $${oldPrice} → live $${livePriceRounded}`);
    } else {
      patched.appliedAdjustments = [...(patched.appliedAdjustments ?? []), 'Price from static dataset — all live sources failed'];
      console.log(`[${symbol}] Using static fallback data (no live price available)`);
    }
    const derived = deriveMetrics(patched);
    const stamped = stampProvenance(derived, 'fallback');
    const divergence = compareWithCachedPrimary(stamped, 'fallback');
    // Cache as if it expired 15 minutes ago so a live source is retried sooner.
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
