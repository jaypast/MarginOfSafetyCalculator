export type DataSource =
  | 'yfinance'
  | 'rapidapi'
  | 'alpha-vantage'
  | 'web-scrape'
  | 'fallback'
  | 'unknown';

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
