import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
): 'Exceptional' | 'Good' | 'Average' | 'Speculative' => {
  // This is a simplified logic to determine company quality
  let score = 0;
  
  // ROE scoring
  if (roe >= 30) score += 4;
  else if (roe >= 20) score += 3;
  else if (roe >= 15) score += 2;
  else if (roe >= 10) score += 1;
  
  // Debt to Equity scoring
  if (debtToEquity < 0.3) score += 4;
  else if (debtToEquity < 0.5) score += 3;
  else if (debtToEquity < 1.0) score += 2;
  else if (debtToEquity < 1.5) score += 1;
  
  // Current Ratio scoring
  if (currentRatio >= 2.0) score += 3;
  else if (currentRatio >= 1.5) score += 2;
  else if (currentRatio >= 1.0) score += 1;
  
  // Revenue Growth scoring
  if (revenueGrowth >= 15) score += 3;
  else if (revenueGrowth >= 10) score += 2;
  else if (revenueGrowth >= 5) score += 1;
  
  // Earnings Stability scoring
  if (earningsStability === 'High') score += 3;
  else if (earningsStability === 'Medium') score += 2;
  else if (earningsStability === 'Low') score += 1;
  
  // Competitive Position scoring
  if (competitivePosition === 'Strong') score += 3;
  else if (competitivePosition === 'Good') score += 2;
  else if (competitivePosition === 'Average') score += 1;
  
  // Determine quality category based on score
  if (score >= 16) return 'Exceptional';
  else if (score >= 12) return 'Good';
  else if (score >= 8) return 'Average';
  else return 'Speculative';
};

export const getRecommendedMarginOfSafety = (quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative'): string => {
  switch (quality) {
    case 'Exceptional':
      return '15-25%';
    case 'Good':
      return '25-35%';
    case 'Average':
      return '35-40%';
    case 'Speculative':
      return '40-50%+';
    default:
      return '35-40%';
  }
};

export const getDefaultMarginOfSafety = (quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative'): number => {
  switch (quality) {
    case 'Exceptional':
      return 20;
    case 'Good':
      return 30;
    case 'Average':
      return 35;
    case 'Speculative':
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

export const calculateDiscountPremium = (
  currentPrice: number,
  comparePrice: number
): number => {
  return ((currentPrice - comparePrice) / comparePrice) * 100;
};
