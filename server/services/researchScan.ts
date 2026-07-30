import { StockResponse } from '@shared/schema';
import { getStockData } from './stockData';

const TARGET_MIN_RESULTS    = 3;
const PER_CALL_TIMEOUT_MS   = 8_000;       // abort per-symbol fetch after 8s
const MAX_SCAN_DURATION_MS  = 20 * 60 * 1000; // wall-clock limit (20 min)
const SUCCESS_DELAY_MS      = 1_500;       // brief pause only after a live-data hit
const BETWEEN_CALL_DELAY_MS = 2_000;       // kept for test-import compat (unused in hot path)
const CACHE_DURATION_MS     = 24 * 60 * 60 * 1000;

export type ScanQuality = 'Exceptional' | 'Good';

export interface ScanCandidate {
  symbol: string;
  name: string;
  price: number;
  eps: number;
  peRatio: number;
  fcfPerShare: number;
  growthRate: number;
  roe: number;
  debtToEquity: number;
  currentRatio: number;
  revenueGrowth: number;
  earningsStability: string;
  grossMargin: number | null;
  operatingMargin: number | null;
  quality: ScanQuality;
  dataSource: string;
  intrinsicValue: number;
  discountPct: number;
}

export interface ScanState {
  status: 'idle' | 'scanning' | 'done';
  scanned: number;
  poolSize: number;
  found: number;
  candidates: ScanCandidate[];
  startedAt?: number;
  completedAt?: number;
}

// ---------------------------------------------------------------------------
// Russell 3000 pool — sectors that historically produce quality businesses.
// Shuffled on every fresh scan so the ordering rotates across runs.
// ---------------------------------------------------------------------------
const SCAN_POOL: string[] = [
  // Technology
  'MSFT', 'AAPL', 'GOOGL', 'META', 'NVDA', 'ADBE', 'CRM', 'NOW', 'INTU', 'ORCL',
  'CSCO', 'TXN', 'QCOM', 'AMAT', 'KLAC', 'LRCX', 'SNPS', 'CDNS', 'ANSS', 'FTNT',
  'PANW', 'ZS', 'CRWD', 'NET', 'DDOG', 'MDB', 'TEAM', 'HUBS', 'TTD', 'PAYC',
  'ACN', 'IBM', 'HPQ', 'JNPR', 'NTAP', 'WDC', 'STX', 'KEYS', 'TRMB', 'LDOS',
  // Financials
  'V', 'MA', 'JPM', 'SPGI', 'MCO', 'AXP', 'GS', 'MS', 'BLK', 'SCHW',
  'ICE', 'CME', 'CBOE', 'MSCI', 'FDS', 'VRSK', 'CINF', 'TRV', 'PGR', 'ALL',
  'WRB', 'AFG', 'ERIE', 'HCI', 'KMPR', 'SIGI', 'UNUM', 'PRU', 'MET', 'LNC',
  // Healthcare
  'UNH', 'LLY', 'TMO', 'ABT', 'DHR', 'SYK', 'BSX', 'EW', 'ISRG', 'ZBH',
  'IDXX', 'ALGN', 'PODD', 'HOLX', 'MCK', 'ABC', 'CAH', 'CVS', 'MOH', 'HUM',
  'CI', 'ELV', 'RGEN', 'NEOG', 'ABMD', 'MASI', 'MMSI', 'NVCR', 'INVA', 'AMED',
  // Consumer Staples
  'PG', 'KO', 'COST', 'WMT', 'TGT', 'MNST', 'HSY', 'GIS', 'CPB', 'SJM',
  'MKC', 'CLX', 'KMB', 'CHD', 'HRL', 'LW', 'POST', 'LANC', 'JJSF', 'DMND',
  // Industrials
  'HON', 'CAT', 'DE', 'EMR', 'ETN', 'ROK', 'ROP', 'FAST', 'GWW', 'HUBB',
  'FELE', 'AOS', 'MAS', 'FBHS', 'NVT', 'GNRC', 'AIRC', 'AWK', 'RSG', 'WM',
  'CPRT', 'ODFL', 'SAIA', 'CHRW', 'EXPD', 'JBHT', 'LSTR', 'POOL', 'TXRH', 'CASY',
  // Consumer Discretionary
  'HD', 'LOW', 'MCD', 'SBUX', 'NKE', 'DPZ', 'YUM', 'CMG', 'WSM', 'FIVE',
  'OLLI', 'PRGS', 'MANH', 'PCTY', 'SPSC', 'QTWO', 'LAD', 'ABG', 'PAG', 'AN',
  // Energy & Materials
  'XOM', 'CVX', 'COP', 'APD', 'ECL', 'PPG', 'SHW', 'NUE', 'RS', 'MLM',
  // Russell 3000 mid-caps known for quality
  'CELH', 'BWXT', 'CACC', 'CSWI', 'MEDP', 'MGRC', 'OSIS', 'PLXS', 'PRFT', 'SSNC',
  'AMSF', 'CBSH', 'FFIN', 'FRME', 'HTLF', 'IBCP', 'NBTB', 'PEBO', 'PPBI', 'WSFS',
];

// ---------------------------------------------------------------------------
// Server-side quality scorer — mirrors client/src/lib/researchCalculations.ts
// Exported for reuse by the emailed Russell 3000 report job (Task #57) so
// both scans grade companies identically.
// ---------------------------------------------------------------------------
export function computeQuality(data: StockResponse): ScanQuality | null {
  const roe = data.roe ?? 0;
  const dte = data.debtToEquity ?? 0;
  const cr  = data.currentRatio ?? 0;
  if (roe > 20 && dte < 0.5 && cr > 1.5) return 'Exceptional';
  if (roe > 15 && dte < 1   && cr > 1.2) return 'Good';
  return null;
}

// Returns true when the quality metrics needed for scoring are present.
// Accepts fallback data for well-specified large-caps (AAPL, MSFT, V, etc.)
// which carry valid ROE / D-E / currentRatio in the static dataset.
export function hasUsableQualityMetrics(data: StockResponse): boolean {
  return (
    typeof data.roe === 'number'          && data.roe !== 0 &&
    typeof data.debtToEquity === 'number' &&
    typeof data.currentRatio === 'number' && data.currentRatio > 0
  );
}

// Server-side intrinsic value estimate. Used only as a discount gate;
// the client re-computes the authoritative figure with the full calculator.
export function estimateIntrinsicValue(data: StockResponse): number {
  const fcf = (data.fcfPerShare && data.fcfPerShare > 0)
    ? data.fcfPerShare
    : (data.eps || 0) * 0.75;
  const eps = data.eps || 0;
  const g   = Math.min((data.growthRate || 8) / 100, 0.25);
  const r   = 0.10;
  const terminal = 15;

  let dcf = 0, cf = fcf;
  for (let i = 1; i <= 10; i++) {
    cf *= (1 + g);
    dcf += cf / Math.pow(1 + r, i);
  }
  dcf += (cf * terminal) / Math.pow(1 + r, 10);

  const pe = data.peRatio > 0 ? Math.min(data.peRatio, 25) : 15;
  const peValue = eps * pe;

  // Graham Number: sqrt(22.5 * EPS * BookValuePerShare)
  const bvps = data.bookValuePerShare ?? 0;
  const grahamNumber = (eps > 0 && bvps > 0)
    ? Math.sqrt(22.5 * eps * bvps)
    : 0;

  const values = [dcf, peValue, grahamNumber].filter(v => v > 0);
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------
// Singleton scan state
// ---------------------------------------------------------------------------
const state: ScanState = {
  status: 'idle',
  scanned: 0,
  poolSize: 0,
  found: 0,
  candidates: [],
};

async function runScan(): Promise<void> {
  const pool = shuffle(SCAN_POOL);

  state.status = 'scanning';
  state.scanned = 0;
  state.found = 0;
  state.candidates = [];
  state.poolSize = pool.length;
  state.startedAt = Date.now();
  state.completedAt = undefined;

  console.log(`[Research scan] Starting — pool size ${pool.length}`);

  for (const symbol of pool) {
    if (state.found >= TARGET_MIN_RESULTS) break;

    if (Date.now() - (state.startedAt ?? 0) > MAX_SCAN_DURATION_MS) {
      console.log(`[Research scan] Wall-clock limit (${MAX_SCAN_DURATION_MS / 60_000}min) reached after ${state.scanned} symbols — stopping`);
      break;
    }

    try {
      const data = await withTimeout(getStockData(symbol), PER_CALL_TIMEOUT_MS);
      state.scanned++;

      // Error or missing price — skip with no delay.
      // (Call already cost up to PER_CALL_TIMEOUT_MS or failed fast; adding
      // another 2s just wastes scan budget with zero rate-limit benefit.)
      if (data.error || !data.price || data.price <= 0) {
        continue;
      }

      // For live-data successes, wait briefly before the next call so we
      // don't immediately hammer the API again after a successful hit.
      const isLiveData = data.dataSource !== 'fallback';
      if (isLiveData) {
        await sleep(SUCCESS_DELAY_MS);
      } else {
        console.log(`[Research scan] Scoring ${symbol} from fallback data (source=${data.dataSource})`);
      }

      if (!hasUsableQualityMetrics(data)) {
        continue;
      }

      const quality = computeQuality(data);
      if (!quality) continue;

      const iv = estimateIntrinsicValue(data);
      const discountPct = iv > 0 ? ((iv - data.price) / iv) * 100 : 0;
      if (discountPct < 10) continue;

      state.candidates.push({
        symbol: data.symbol,
        name: data.name,
        price: data.price,
        eps: data.eps,
        peRatio: data.peRatio,
        fcfPerShare: data.fcfPerShare,
        growthRate: data.growthRate,
        roe: data.roe ?? 0,
        debtToEquity: data.debtToEquity ?? 0,
        currentRatio: data.currentRatio ?? 0,
        revenueGrowth: data.revenueGrowth ?? 0,
        earningsStability: data.earningsStability ?? 'Medium',
        grossMargin: data.grossMargin ?? null,
        operatingMargin: data.operatingMargin ?? null,
        quality,
        dataSource: data.dataSource || 'unknown',
        intrinsicValue: parseFloat(iv.toFixed(2)),
        discountPct: parseFloat(discountPct.toFixed(1)),
      });
      state.found++;
      console.log(`[Research scan] Found candidate: ${symbol} (quality=${quality}, discount~${discountPct.toFixed(1)}%, source=${data.dataSource})`);

    } catch (err) {
      // Timeout or unexpected error — no delay, move straight to the next symbol.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('Timeout')) {
        console.log(`[Research scan] ${symbol} timed out after ${PER_CALL_TIMEOUT_MS / 1000}s — skipping`);
      } else {
        console.error(`[Research scan] Error for ${symbol}:`, msg);
      }
      state.scanned++;
    }
  }

  state.status = 'done';
  state.completedAt = Date.now();
  const elapsed = ((state.completedAt - (state.startedAt ?? state.completedAt)) / 1000).toFixed(0);
  console.log(`[Research scan] Done — scanned ${state.scanned}/${state.poolSize}, found ${state.found}, elapsed ${elapsed}s`);
}

export function getScanState(): ScanState {
  return { ...state, candidates: [...state.candidates] };
}

export function isScanCacheFresh(): boolean {
  return (
    state.status === 'done' &&
    state.completedAt !== undefined &&
    Date.now() - state.completedAt < CACHE_DURATION_MS
  );
}

export function startScanIfNeeded(forceRefresh = false): void {
  if (state.status === 'scanning') return;
  if (!forceRefresh && isScanCacheFresh()) return;

  runScan().catch(err => {
    console.error('[Research scan] Unhandled error:', err);
    state.status = 'done';
    state.completedAt = Date.now();
  });
}

// Test-only helpers — reset or seed singleton state without touching production behaviour.
export function _resetScanStateForTests(): void {
  state.status = 'idle';
  state.scanned = 0;
  state.poolSize = 0;
  state.found = 0;
  state.candidates = [];
  state.startedAt = undefined;
  state.completedAt = undefined;
}

export function _setCompletedForTests(completedAt: number): void {
  state.status = 'done';
  state.completedAt = completedAt;
  state.scanned = 5;
  state.poolSize = 10;
  state.found = 3;
  state.candidates = [];
  state.startedAt = completedAt - 30_000;
}

export function _setScanningForTests(startedAt: number): void {
  state.status = 'scanning';
  state.scanned = 0;
  state.poolSize = SCAN_POOL.length;
  state.found = 0;
  state.candidates = [];
  state.startedAt = startedAt;
  state.completedAt = undefined;
}

export { SCAN_POOL, MAX_SCAN_DURATION_MS, PER_CALL_TIMEOUT_MS, BETWEEN_CALL_DELAY_MS };
