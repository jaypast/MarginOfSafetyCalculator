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
  error?: boolean;
  errorMessage?: string;
}

export interface ValuationParams {
  // DCF Parameters
  dcfGrowthRate: number;
  dcfDiscountRate: number;
  dcfTerminalMultiple: number;
  dcfForecastPeriod: number;
  
  // P/E Parameters
  peType: 'current' | '5year' | '10year' | 'industry' | 'custom';
  peCustomValue: number;
  peAdjustment: number;
  
  // Graham Parameters
  grahamGrowthRate: number;
  grahamBaseValue: number;
}

export interface MarginOfSafetyParams {
  marginOfSafety: number;
}

export interface ValuationResult {
  method: string;
  intrinsicValue: number;
  buyBelow: number;
  discountPremium: number;
}

export interface CompanyQualityResult {
  quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative';
  recommendedMarginOfSafety: string;
}

export type CalculationMethod = 'dcf' | 'pe' | 'graham';
