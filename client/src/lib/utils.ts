import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  evaluateCompanyQuality,
  type CompanyQuality,
} from "@shared/companyQuality";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

export const formatPercent = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value / 100);
};

export const getCompanyQuality = (
  roe: number,
  debtToEquity: number,
  currentRatio: number,
  revenueGrowth: number,
  earningsStability: string,
  competitivePosition: string
): CompanyQuality | null =>
  evaluateCompanyQuality({
    roe,
    debtToEquity,
    currentRatio,
    revenueGrowth,
    earningsStability,
    competitivePosition,
  }).quality;

export const getRecommendedMarginOfSafety = (quality: CompanyQuality): string => {
  switch (quality) {
    case 'Exceptional':
      return '15-25%';
    case 'Good':
      return '25-35%';
    case 'Average':
      return '35-40%';
    case 'Caution':
      return '40-50%+';
    default:
      return '35-40%';
  }
};

export const getDefaultMarginOfSafety = (quality: CompanyQuality): number => {
  switch (quality) {
    case 'Exceptional':
      return 20;
    case 'Good':
      return 30;
    case 'Average':
      return 35;
    case 'Caution':
      return 45;
    default:
      return 35;
  }
};

export const getStatusColor = (
  currentPrice: number,
  buyBelowPrice: number
): 'success' | 'warning' | 'danger' => {
  const discountPercent = (buyBelowPrice - currentPrice) / buyBelowPrice * 100;
  
  if (discountPercent >= 10) return 'success'; // Good discount
  if (discountPercent >= 0) return 'warning'; // Small discount
  return 'danger'; // Premium (above buy price)
};

export const getStatusMessage = (
  currentPrice: number,
  buyBelowPrice: number
): string => {
  if (currentPrice <= buyBelowPrice) {
    return 'Below buy price: Consider buying';
  } else {
    return 'Above buy price: Wait';
  }
};

// Function that provides a stock valuation assessment
export const getInvestmentRecommendation = (
  discountPremium: number
): { action: 'UNDERVALUED' | 'FAIRLY VALUED' | 'OVERVALUED', rationale: string } => {
  // Significant discount
  if (discountPremium <= -20) {
    return { 
      action: 'UNDERVALUED', 
      rationale: 'Significant margin of safety'
    };
  }
  
  // Moderate discount
  if (discountPremium <= -10) {
    return { 
      action: 'UNDERVALUED', 
      rationale: 'Adequate margin of safety'
    };
  }
  
  // Small discount
  if (discountPremium < 0) {
    return { 
      action: 'FAIRLY VALUED', 
      rationale: 'Limited margin of safety'
    };
  }
  
  // Small premium
  if (discountPremium < 10) {
    return { 
      action: 'FAIRLY VALUED', 
      rationale: 'Current price near intrinsic value'
    };
  }
  
  // Significant premium
  return { 
    action: 'OVERVALUED', 
    rationale: 'Price exceeds intrinsic value'
  };
};

export const calculateDiscountPremium = (
  currentPrice: number,
  comparePrice: number
): number => {
  return ((currentPrice - comparePrice) / comparePrice) * 100;
};

/**
 * Detects if a stock appears to be an ETF or index fund based on its name and symbol patterns
 */
export const isETF = (stockData: any): boolean => {
  if (!stockData) return false;
  
  // Common ETF tickers
  const commonETFs = [
    'SPY', 'VOO', 'QQQ', 'IWM', 'DIA', 'VTI', 'GLD', 'SLV',
    'EEM', 'VWO', 'XLF', 'XLE', 'XLK', 'XLV', 'XLU', 'XLI',
    'XLP', 'XLY', 'XLB', 'XLC', 'VGK', 'VPL', 'VEA'
  ];

  // Check if symbol is in the common ETF list
  if (commonETFs.includes(stockData.symbol)) {
    return true;
  }

  const name = (stockData.name ?? '').toUpperCase();

  // If the name ends with a corporate-entity suffix it cannot be an ETF,
  // regardless of any other substring match (e.g. "Netflix, Inc. - NASDAQ").
  if (/\b(INC\.?|CORP\.?|LTD\.?|LLC\.?|CO\.?|PLC\.?|NV|SA|AG|SE|HOLDINGS|GROUP)\s*$/.test(name)) {
    return false;
  }

  // ETF-specific name patterns — deliberately excludes exchange names like
  // 'NASDAQ' and 'DOW' that appear in scraped stock names but are not ETF
  // indicators on their own.
  const etfNamePatterns = [
    'ETF', 'INDEX FUND', 'INDEX ETF', 'TRUST', 'S&P',
    'RUSSELL', 'VANGUARD', 'ISHARES', 'SPDR', 'MARKET VECTORS',
  ];

  for (const pattern of etfNamePatterns) {
    if (name.includes(pattern)) {
      return true;
    }
  }

  // Word-boundary checks for common standalone fund words
  if (/\bFUND\b/.test(name) || /\bETF\b/.test(name)) {
    return true;
  }

  // Not detected as an ETF
  return false;
};
