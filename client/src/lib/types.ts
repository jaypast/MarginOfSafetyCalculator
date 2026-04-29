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
  error?: boolean;
  errorMessage?: string;
}

// Only valuation modes that have a real, per-stock data backing are supported.
// The previous "5year" / "10year" / "industry" options applied hard-coded
// constants (18.6 / 16.2 / 22.5) to *every* stock regardless of sector — that
// produced misleading "intrinsic values". They have been removed; users who
// want a non-current multiple can pick "custom".
export interface ValuationParams {
  // DCF Parameters
  dcfGrowthRate: number;
  dcfDiscountRate: number;
  dcfTerminalMultiple: number;
  dcfForecastPeriod: number;

  // P/E Parameters
  peType: 'current' | 'custom';
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
