// Fed rate environment service (Task #31).
//
// Pulls the FRED FEDFUNDS series (effective Federal Funds Rate, monthly)
// from the public CSV endpoint — no API key required — and classifies
// the trailing 12-month change. The result is cached in-memory for 24h
// to stay well under FRED's rate limits and to keep the badge cheap to
// render on every page load.
//
// The classifier is exported separately so it can be tested deterministically
// without any network calls.

import type { FedRateEnvironment, FedRateResponse } from "@shared/schema";

// DFEDTARU = Federal Funds Target Range — Upper Limit (daily). Matches the
// task's "Fed funds target rate" language better than FEDFUNDS (which is the
// realised effective rate). Falls back through the same cache + classifier.
const FRED_CSV_URL =
  "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 8_000;

interface CacheEntry {
  payload: FedRateResponse;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

/**
 * Pure classifier — exported for tests. Thresholds:
 *   - delta ≥ +50 bp YoY → 'rising'
 *   - delta ≤ −50 bp YoY → 'falling'
 *   - otherwise         → 'stable'
 */
export function classifyFedRateEnvironment(
  currentRate: number,
  yearAgoRate: number,
): { environment: FedRateEnvironment; deltaBp: number } {
  const deltaBp = Math.round((currentRate - yearAgoRate) * 100);
  let environment: FedRateEnvironment = "stable";
  if (deltaBp >= 50) environment = "rising";
  else if (deltaBp <= -50) environment = "falling";
  return { environment, deltaBp };
}

interface FredObservation {
  date: string; // YYYY-MM-DD
  value: number;
}

/**
 * Parse a FRED CSV payload (DATE,FEDFUNDS) into observations, dropping
 * the header row and any rows whose value is missing ("." sentinel).
 * Exported for tests.
 */
export function parseFredCsv(csv: string): FredObservation[] {
  const lines = csv.trim().split(/\r?\n/);
  const out: FredObservation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, raw] = lines[i].split(",");
    if (!date || !raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue; // FRED uses "." for missing
    out.push({ date: date.trim(), value });
  }
  return out;
}

/**
 * Pick the latest observation and the one closest to 12 months earlier.
 * Exported for tests so we can validate the lookup behaviour without
 * mocking fetch.
 */
export function pickCurrentAndYearAgo(
  obs: FredObservation[],
): { current: FredObservation; yearAgo: FredObservation } | null {
  if (obs.length < 2) return null;
  const current = obs[obs.length - 1];
  const currentDate = new Date(current.date);
  if (Number.isNaN(currentDate.getTime())) return null;
  const targetTs = new Date(currentDate);
  targetTs.setUTCFullYear(targetTs.getUTCFullYear() - 1);
  const target = targetTs.getTime();

  let best: FredObservation | null = null;
  let bestGap = Infinity;
  for (const o of obs) {
    const ts = new Date(o.date).getTime();
    if (Number.isNaN(ts)) continue;
    const gap = Math.abs(ts - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = o;
    }
  }
  if (!best || best.date === current.date) return null;
  return { current, yearAgo: best };
}

async function fetchFredCsv(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FRED_CSV_URL, {
      signal: controller.signal,
      headers: { Accept: "text/csv" },
    });
    if (!res.ok) {
      throw new Error(`FRED responded ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the current Fed rate environment, using a 24h in-memory cache.
 * Returns null on failure so callers can hide the badge gracefully —
 * this is informational and must never block the rest of the app.
 */
export async function getFedRateEnvironment(): Promise<FedRateResponse | null> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return { ...cache.payload, source: "cache" };
  }

  try {
    const csv = await fetchFredCsv();
    const obs = parseFredCsv(csv);
    const picked = pickCurrentAndYearAgo(obs);
    if (!picked) return cache ? { ...cache.payload, source: "cache" } : null;

    const { environment, deltaBp } = classifyFedRateEnvironment(
      picked.current.value,
      picked.yearAgo.value,
    );
    const payload: FedRateResponse = {
      environment,
      currentRate: picked.current.value,
      yearAgoRate: picked.yearAgo.value,
      deltaBp,
      asOf: picked.current.date,
      source: "fred",
    };
    cache = { payload, expiresAt: now + CACHE_TTL_MS };
    return payload;
  } catch (err) {
    // Hide gracefully on fetch failure. If we have a stale cache, prefer
    // serving it over nothing — a slightly old rate environment is more
    // useful than no badge at all.
    if (cache) return { ...cache.payload, source: "cache" };
    return null;
  }
}

// Test-only helper. Vitest can reset internal state between cases without
// touching production behaviour.
export function _resetFedRateCacheForTests(): void {
  cache = null;
}
