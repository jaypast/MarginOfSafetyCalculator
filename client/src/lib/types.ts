export type DataSource =
  | 'yfinance'
  | 'rapidapi'
  | 'alphavantage'
  | 'scraper'
  | 'fallback'
  | 'unknown';

// Cross-source divergence — populated by the server when a background
// spot-check between two upstream providers found at least one comparable
// metric exceeding the 15% tolerance. Used by the StockInformation chip to
// warn users that the headline numbers may be unreliable.
export interface CrossSourceDivergence {
  checkedAt: string;
  sourceA: DataSource;
  sourceB: DataSource;
  fields: Array<{
    field: string;
    valueA: number;
    valueB: number;
    deltaPct: number;
  }>;
}

// Historical P/E block (Task #15) — per-ticker trailing-twelve-month P/E
// medians computed by the upstream adapter from quarterly EPS + price
// history, plus a published per-industry baseline. Each field is
// independently nullable so adapters with partial coverage can return
// what they have. Adapters without any historical visibility omit the
// whole block, in which case the calculator's `industry` branch falls
// back to the in-app `INDUSTRY_PE_BASELINES` lookup.
export interface PeHistory {
  fiveYearAvg: number | null;
  tenYearAvg: number | null;
  industryAvg: number | null;
}

export interface StockData {
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
  competitivePosition: string;
  lastUpdated?: string; // Date when the data was last updated
  // Server-provided provenance — surfaced as a badge in the UI so investors
  // can see which upstream API the numbers came from and how stale they are.
  dataSource?: DataSource;
  fetchedAt?: string;
  appliedAdjustments?: string[];
  // Latest cross-source spot-check result (null = sources agreed).
  crossSourceDivergence?: CrossSourceDivergence | null;
  // Per-ticker historical P/E series (null when adapter doesn't compute it).
  peHistory?: PeHistory | null;
  error?: boolean;
  errorMessage?: string;
}

// P/E modes (Task #15). The `5year` / `10year` modes consume the upstream
// per-ticker `peHistory` block — the medians of trailing-twelve-month P/E
// over the last 20 / 40 quarters. The `industry` mode uses the published
// per-sector baseline from `INDUSTRY_PE_BASELINES` (or the upstream's
// `peHistory.industryAvg` when populated). Each branch falls back to the
// current P/E with an explicit `appliedAdjustments` note when its data
// source is unavailable, so the user is never silently shown a magic
// constant the way the old (pre-Task-#9) implementation did.
export interface ValuationParams {
  // DCF Parameters
  dcfGrowthRate: number;
  dcfDiscountRate: number;
  dcfTerminalMultiple: number;
  dcfForecastPeriod: number;

  // P/E Parameters
  peType: 'current' | 'custom' | '5year' | '10year' | 'industry';
  peCustomValue: number;
  peAdjustment: number;

  // Graham Parameters
  grahamGrowthRate: number;
  grahamBaseValue: number;

  // Optional: when true, Japanese listings (.T) get a price-floor applied so
  // intrinsic value cannot drop below 65–70 % of current price. Off by default
  // because the floor makes those stocks appear un-falsifiable.
  applyJapanFloor?: boolean;
}

export interface MarginOfSafetyParams {
  marginOfSafety: number;
}

export interface ValuationResult {
  method: string;
  intrinsicValue: number;
  buyBelow: number;
  discountPremium: number;
  buyBelowStatus?: number; // Added to track status relative to buy below price with MoS applied
  // Human-readable list of caps / overrides applied during this calculation
  // (e.g. "P/E capped at 25 (industry: AUTO_MANUFACTURER)").
  appliedAdjustments?: string[];
}

export interface CompanyQualityResult {
  quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative';
  recommendedMarginOfSafety: string;
}

export type CalculationMethod = 'dcf' | 'pe' | 'graham';

// Reverse DCF — answers "what growth rate would justify the current price under
// this DCF model?". Sentinel `impliedGrowthRate = -1` together with
// `status = 'not_applicable'` means the model cannot be applied (e.g. negative
// FCF and EPS, or non-positive price).
export interface ReverseDCFResult {
  impliedGrowthRate: number;          // %, or the clamp boundary when status != 'solved'
  status: 'solved' | 'above_max' | 'below_min' | 'not_applicable';
  interpretation: string;             // Short human-readable comparison vs. company history
  appliedAdjustments: string[];       // Same provenance pattern as the other valuations
}

// Watchlist entry — what the /api/watchlist endpoint returns. `marginOfSafety`
// is the whole-number percent the user picked when they added the ticker.
export interface WatchlistEntry {
  id: number;
  symbol: string;
  marginOfSafety: number;
  createdAt: string;  // ISO timestamp
}
