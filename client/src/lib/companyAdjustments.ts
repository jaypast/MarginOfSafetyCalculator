import { StockData } from "./types";

/**
 * Types for company and industry adjustments
 */
export interface AdjustmentFactors {
  // FCF estimation factors
  fcfToEpsRatio: number;        // Used when FCF data is missing/unreliable
  
  // DCF calculation factors
  growthRateCap: number;        // Maximum allowed growth rate
  terminalMultipleCap: number;  // Maximum terminal value multiple
  
  // Valuation caps
  fcfMultipleCap: number;       // Maximum P/FCF multiple
  peMultipleCap: number;        // Maximum P/E multiple for Graham method
  
  // Price-based caps
  priceToCap: number;           // Maximum ratio of intrinsic value to current price
}

/**
 * Industry-specific adjustment factors
 */
export const industryAdjustments: Record<string, AdjustmentFactors> = {
  AUTO_MANUFACTURER: {
    fcfToEpsRatio: 0.75,       // Auto companies typically have lower FCF due to capital needs
    growthRateCap: 15,         // Auto industry rarely grows faster than 15%
    terminalMultipleCap: 12,   // Lower terminal multiples due to cyclical business
    fcfMultipleCap: 20,        // More conservative FCF multiple cap
    peMultipleCap: 25,         // Conservative PE multiple for Graham
    priceToCap: 2.5            // Cap value at 2.5x current price as a sanity check
  },
  TECHNOLOGY: {
    fcfToEpsRatio: 1.1,        // Tech companies often have higher FCF than EPS
    growthRateCap: 25,         // Tech can grow faster
    terminalMultipleCap: 20,   // Higher terminal multiples for tech
    fcfMultipleCap: 40,        // Higher FCF multiple allowed
    peMultipleCap: 40,         // Higher PE allowed for tech
    priceToCap: 4.0            // More room for valuation swings
  },
  FINANCIAL: {
    fcfToEpsRatio: 0.6,        // Financial companies often have complicated FCF
    growthRateCap: 12,         // Financials grow slower
    terminalMultipleCap: 12,   // More conservative terminal values
    fcfMultipleCap: 15,        // Conservative FCF multiple
    peMultipleCap: 20,         // Conservative PE ratio
    priceToCap: 2.0            // Financial companies typically less volatile
  },
  RETAIL: {
    fcfToEpsRatio: 0.85,       // Retail has decent FCF
    growthRateCap: 15,         // Modest growth typically
    terminalMultipleCap: 15,   // Medium terminal multiple
    fcfMultipleCap: 25,        // Medium FCF multiple
    peMultipleCap: 30,         // Medium PE multiple
    priceToCap: 3.0            // Medium price cap
  },
  HEALTHCARE: {
    fcfToEpsRatio: 0.9,        // Healthcare generally has good FCF
    growthRateCap: 20,         // Can grow at a decent pace
    terminalMultipleCap: 18,   // Higher terminal multiples
    fcfMultipleCap: 30,        // Higher FCF multiple
    peMultipleCap: 35,         // Higher PE multiple
    priceToCap: 3.5            // More room for valuation
  },
  // Default for unknown industries
  DEFAULT: {
    fcfToEpsRatio: 0.85,       // Conservative default
    growthRateCap: 20,         // Reasonable default growth cap
    terminalMultipleCap: 15,   // Medium terminal multiple
    fcfMultipleCap: 30,        // Medium FCF multiple cap
    peMultipleCap: 30,         // Medium PE cap
    priceToCap: 3.0            // Medium price cap
  }
};

/**
 * Special cases that need very specific handling beyond industry norms
 */
export const specialCases: Record<string, Partial<AdjustmentFactors>> = {
  // Alibaba special handling
  'BABA': { 
    fcfToEpsRatio: 0.85, 
    terminalMultipleCap: 15, 
    growthRateCap: 15 
  },
  '9988.HK': { 
    fcfToEpsRatio: 0.85, 
    terminalMultipleCap: 15, 
    growthRateCap: 15 
  },
  // Toyota specific handling
  'TM': {
    fcfToEpsRatio: 0.75,
    terminalMultipleCap: 12,
    priceToCap: 3.0
  },
  '7203.T': {
    fcfToEpsRatio: 0.75,
    terminalMultipleCap: 12,
    priceToCap: 2.0  // Stricter cap for Japanese listing
  },
  // Ford special handling - FCF appears unusually high compared to earnings
  'F': {
    fcfToEpsRatio: 0.85, // Lower FCF to EPS ratio to prevent overvaluation
    terminalMultipleCap: 8, // Lower terminal multiple for Ford
    fcfMultipleCap: 15, // Lower FCF multiple cap
    priceToCap: 1.8 // Stricter price cap for Ford
  },
  // Other special cases can be added here
};

/**
 * Map of company symbols to their industry
 */
export const companyIndustryMap: Record<string, string> = {
  // Auto manufacturers
  'TM': 'AUTO_MANUFACTURER',
  'F': 'AUTO_MANUFACTURER',
  'GM': 'AUTO_MANUFACTURER',
  'TSLA': 'AUTO_MANUFACTURER',
  'HMC': 'AUTO_MANUFACTURER',
  '7203.T': 'AUTO_MANUFACTURER',
  '7267.T': 'AUTO_MANUFACTURER',
  
  // Technology companies
  'AAPL': 'TECHNOLOGY',
  'MSFT': 'TECHNOLOGY',
  'GOOGL': 'TECHNOLOGY',
  'GOOG': 'TECHNOLOGY',
  'META': 'TECHNOLOGY',
  'AMZN': 'TECHNOLOGY',
  'NVDA': 'TECHNOLOGY',
  // Note: TSLA is defined above in AUTO_MANUFACTURER
  
  // Financial companies
  'JPM': 'FINANCIAL',
  'BAC': 'FINANCIAL',
  'WFC': 'FINANCIAL',
  'C': 'FINANCIAL',
  'GS': 'FINANCIAL',
  
  // Retail companies
  'WMT': 'RETAIL',
  'TGT': 'RETAIL',
  'COST': 'RETAIL',
  'HD': 'RETAIL',
  'LOW': 'RETAIL',
  
  // Healthcare companies
  'JNJ': 'HEALTHCARE',
  'PFE': 'HEALTHCARE',
  'UNH': 'HEALTHCARE',
  'MRK': 'HEALTHCARE',
  'ABT': 'HEALTHCARE',
  
  // Add more company-to-industry mappings as needed
};

/**
 * Function to determine industry from symbol and available data
 */
export function determineIndustry(stockData: StockData): string {
  // Try direct mapping from our lookup table first
  if (companyIndustryMap[stockData.symbol]) {
    return companyIndustryMap[stockData.symbol];
  }
  
  // If we don't have a direct mapping, we could use sector data
  // (future enhancement when sector data becomes available)
  
  // Check for symbol patterns to detect industry
  const symbol = stockData.symbol || '';
  
  // Check for Japanese auto manufacturers by pattern
  if (symbol && typeof symbol === 'string' && symbol.endsWith('.T') && 
      (symbol.startsWith('7') || symbol.includes('AUTO') || symbol.includes('MOTOR'))) {
    return 'AUTO_MANUFACTURER';
  }
  
  // Check for financial companies by pattern
  if (symbol && typeof symbol === 'string' && 
      (symbol.includes('BANK') || symbol.includes('FINANCIAL') || 
       symbol.includes('INSURANCE') || symbol.includes('CAPITAL'))) {
    return 'FINANCIAL';
  }
  
  // Default if we can't determine the industry
  return 'DEFAULT';
}

/**
 * Function to detect data quality issues
 */
export function detectDataIssues(stockData: StockData): { 
  hasFcfIssue: boolean,
  hasEpsIssue: boolean,
  hasPeIssue: boolean,
  hasExtremeFcf: boolean
} {
  return {
    hasFcfIssue: stockData.fcfPerShare <= 0,
    hasEpsIssue: stockData.eps <= 0,
    hasPeIssue: stockData.peRatio <= 0 || stockData.peRatio > 100,
    hasExtremeFcf: stockData.eps > 0 && stockData.fcfPerShare > stockData.eps * 3
  };
}

/**
 * Main function to get appropriate adjustment factors for a company
 */
export function getAdjustmentFactors(stockData: StockData): AdjustmentFactors {
  // Check for special case first
  if (specialCases[stockData.symbol]) {
    const specialCase = specialCases[stockData.symbol];
    // Merge with default settings for any missing properties
    return { ...industryAdjustments.DEFAULT, ...specialCase };
  }
  
  // Get industry-based adjustments
  const industry = determineIndustry(stockData);
  const baseAdjustments = industryAdjustments[industry] || industryAdjustments.DEFAULT;
  
  // Detect data issues and modify adjustments if needed
  const dataIssues = detectDataIssues(stockData);
  
  if (dataIssues.hasFcfIssue || dataIssues.hasEpsIssue || dataIssues.hasExtremeFcf) {
    // Apply more conservative adjustments for stocks with data issues
    return {
      ...baseAdjustments,
      terminalMultipleCap: Math.min(baseAdjustments.terminalMultipleCap, 12),
      priceToCap: Math.min(baseAdjustments.priceToCap, 2.0),
      fcfMultipleCap: Math.min(baseAdjustments.fcfMultipleCap, 20)
    };
  }
  
  // Handle market-specific adjustments
  if (stockData.symbol && typeof stockData.symbol === 'string' && stockData.symbol.endsWith('.T')) {
    // Japanese market tends to have lower valuations
    return {
      ...baseAdjustments,
      priceToCap: Math.min(baseAdjustments.priceToCap, 2.5)
    };
  }
  
  return baseAdjustments;
}