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
};

/**
 * Map of company symbols to their industry.
 * Each symbol must appear at most once — duplicates are detected by the test
 * suite (`tests/companyAdjustments.test.ts`) so we can't accidentally create a
 * conflicting mapping.
 *
 * Edge case: TSLA. It's an "auto manufacturer" by SEC classification (and that
 * dominates its margin / cyclicality profile), even though many investors
 * treat it as a tech stock. We classify it as AUTO_MANUFACTURER for the
 * conservative caps — this is intentional and is what the previous comment
 * was hinting at. If you want to reclassify, remove it from
 * AUTO_MANUFACTURER below before adding to TECHNOLOGY.
 */
export const companyIndustryMap: Record<string, string> = {
  // Auto manufacturers
  'TM': 'AUTO_MANUFACTURER',
  'F': 'AUTO_MANUFACTURER',
  'GM': 'AUTO_MANUFACTURER',
  'TSLA': 'AUTO_MANUFACTURER', // see note above
  'HMC': 'AUTO_MANUFACTURER',
  '7203.T': 'AUTO_MANUFACTURER', // Toyota
  '7267.T': 'AUTO_MANUFACTURER', // Honda

  // Technology companies (TSLA intentionally excluded — see comment above)
  'AAPL': 'TECHNOLOGY',
  'MSFT': 'TECHNOLOGY',
  'GOOGL': 'TECHNOLOGY',
  'GOOG': 'TECHNOLOGY',
  'META': 'TECHNOLOGY',
  'AMZN': 'TECHNOLOGY',
  'NVDA': 'TECHNOLOGY',

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
};

/**
 * Function to determine industry from symbol and available data.
 *
 * Note on the previous heuristic: classifying *every* `7xxx.T` symbol as
 * AUTO_MANUFACTURER produced false positives for Nintendo (7974.T, gaming),
 * Mitsubishi Heavy (7011.T, industrial), Hoya (7741.T, optics) and others.
 * The fix is to only treat a Japanese symbol as auto when its name actually
 * contains an auto/motor token — pattern-matching on the leading digit of
 * the local TSE numeric code is unsafe.
 */
export function determineIndustry(stockData: StockData): string {
  // Try direct mapping from our lookup table first
  if (companyIndustryMap[stockData.symbol]) {
    return companyIndustryMap[stockData.symbol];
  }

  const symbol = stockData.symbol.toUpperCase();
  const name = (stockData.name || '').toUpperCase();

  // Auto manufacturers: only by name/symbol token, not by TSE code prefix
  if (/\b(AUTO|MOTOR|MOTORS|AUTOMOBILE)\b/.test(name) ||
      symbol.includes('MOTOR')) {
    return 'AUTO_MANUFACTURER';
  }

  // Financial companies: name OR symbol contains a finance token
  if (/\b(BANK|FINANCIAL|INSURANCE|CAPITAL)\b/.test(name) ||
      symbol.includes('BANK') || symbol.includes('FINANCIAL') ||
      symbol.includes('INSURANCE') || symbol.includes('CAPITAL')) {
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
  if (stockData.symbol.endsWith('.T')) {
    // Japanese market tends to have lower valuations
    return {
      ...baseAdjustments,
      priceToCap: Math.min(baseAdjustments.priceToCap, 2.5)
    };
  }

  return baseAdjustments;
}

/**
 * Returns a human-readable label for the industry classification, to be
 * surfaced in the UI as part of the "applied adjustments" provenance list.
 */
export function describeIndustry(stockData: StockData): string {
  const industry = determineIndustry(stockData);
  const isSpecial = !!specialCases[stockData.symbol];
  return isSpecial
    ? `special-case adjustments for ${stockData.symbol}`
    : `industry caps: ${industry}`;
}
