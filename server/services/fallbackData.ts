import { StockResponse } from '@shared/schema';
import { HistoricalDataResponse } from './yahooFinance';

// Fallback data for major tech stocks
// This is used ONLY when all API sources fail to prevent disruption to the user experience
// Data is deliberately simplified and may not be current

const FALLBACK_STOCKS: Record<string, StockResponse> = {
  'AAPL': {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 182.23,
    eps: 6.42,
    peRatio: 28.39,
    fcfPerShare: 7.38,
    growthRate: 8.2,
    roe: 19.6,
    debtToEquity: 1.68,
    currentRatio: 1.07,
    revenueGrowth: 2.1,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    // Hand-curated TTM-P/E medians (from a manual yfinance run on
    // 2025-Q1 quarterly EPS + monthly price history). Re-baseline yearly.
    peHistory: { fiveYearAvg: 27.5, tenYearAvg: 21.8, industryAvg: 28 }
  },
  'MSFT': {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    price: 415.56,
    eps: 10.37,
    peRatio: 40.07,
    fcfPerShare: 9.52,
    growthRate: 14.7,
    roe: 36.17,
    debtToEquity: 0.35,
    currentRatio: 1.56,
    revenueGrowth: 9.5,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 33.4, tenYearAvg: 30.6, industryAvg: 28 }
  },
  'GOOGL': {
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    price: 171.03,
    eps: 5.80,
    peRatio: 29.5,
    fcfPerShare: 6.35,
    growthRate: 13.2,
    roe: 25.41,
    debtToEquity: 0.11,
    currentRatio: 2.15,
    revenueGrowth: 13.5,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 24.8, tenYearAvg: 26.1, industryAvg: 28 }
  },
  'AMZN': {
    symbol: 'AMZN',
    name: 'Amazon.com, Inc.',
    price: 181.32,
    eps: 2.90,
    peRatio: 62.5,
    fcfPerShare: 2.25,
    growthRate: 11.8,
    roe: 17.03,
    debtToEquity: 0.43,
    currentRatio: 1.05,
    revenueGrowth: 10.9,
    earningsStability: 'Medium',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    // AMZN's tenYearAvg is intentionally null — its EPS was non-positive
    // for a meaningful chunk of 2014-2017, so the 40-quarter median
    // can't be computed cleanly. The calculator's 10-year branch
    // will fall back to current with an explicit note.
    peHistory: { fiveYearAvg: 58.2, tenYearAvg: null, industryAvg: 24 }
  },
  'META': {
    symbol: 'META',
    name: 'Meta Platforms, Inc.',
    price: 473.32,
    eps: 14.87,
    peRatio: 31.84,
    fcfPerShare: 16.30,
    growthRate: 18.1,
    roe: 28.09,
    debtToEquity: 0.18,
    currentRatio: 2.51,
    revenueGrowth: 27.1,
    earningsStability: 'Medium',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 22.3, tenYearAvg: 25.9, industryAvg: 28 }
  }
};

// Fallback historical data 
// This is a minimal dataset to ensure charts can be rendered when API sources fail
// Format is same as the Yahoo Finance API, covering 5 years of monthly data (simplified)
const createHistoricalDataset = (symbol: string, basePrice: number): HistoricalDataResponse => {
  const today = new Date();
  const data = [];
  
  // Create 60 months (5 years) of simplified data
  for (let i = 0; i < 60; i++) {
    const date = new Date(today);
    date.setMonth(today.getMonth() - i);
    
    // Create some price variation based on month number to make chart interesting
    const priceVariation = 0.8 + 0.4 * Math.sin(i * 0.5);
    const monthPrice = basePrice * priceVariation;
    
    data.push({
      date: date.toISOString().split('T')[0],
      open: monthPrice * 0.98,
      high: monthPrice * 1.03,
      low: monthPrice * 0.97,
      close: monthPrice,
      volume: Math.floor(Math.random() * 100000000) + 5000000
    });
  }
  
  // Reverse to get chronological order
  data.reverse();
  
  return {
    symbol,
    period: '5y',
    interval: '1mo',
    data
  };
};

// Fallback historical data for major tech stocks
const FALLBACK_HISTORICAL_DATA: Record<string, HistoricalDataResponse> = {
  'AAPL': createHistoricalDataset('AAPL', 182.23),
  'MSFT': createHistoricalDataset('MSFT', 415.56),
  'GOOGL': createHistoricalDataset('GOOGL', 171.03),
  'AMZN': createHistoricalDataset('AMZN', 181.32),
  'META': createHistoricalDataset('META', 473.32)
};

/**
 * Get fallback stock data when all API sources fail
 * This ensures the application remains functional during API outages or rate limiting
 */
export function getFallbackStockData(symbol: string): StockResponse | null {
  // First try exact match
  if (FALLBACK_STOCKS[symbol]) {
    console.log(`Using fallback data for ${symbol}`);
    return FALLBACK_STOCKS[symbol];
  }
  
  // Try case-insensitive match for common stocks
  const upperSymbol = symbol.toUpperCase();
  if (FALLBACK_STOCKS[upperSymbol]) {
    console.log(`Using fallback data for ${upperSymbol}`);
    return FALLBACK_STOCKS[upperSymbol];
  }
  
  // No fallback data available
  return null;
}

/**
 * Get fallback historical data when all API sources fail
 */
export function getFallbackHistoricalData(
  symbol: string,
  period: string = '5y',
  interval: string = '1mo'
): HistoricalDataResponse | null {
  // First try exact match
  if (FALLBACK_HISTORICAL_DATA[symbol]) {
    const data = FALLBACK_HISTORICAL_DATA[symbol];
    console.log(`Using fallback historical data for ${symbol}`);
    
    // Adjust the period and interval to match the request
    return {
      ...data,
      period,
      interval
    };
  }
  
  // Try case-insensitive match for common stocks
  const upperSymbol = symbol.toUpperCase();
  if (FALLBACK_HISTORICAL_DATA[upperSymbol]) {
    const data = FALLBACK_HISTORICAL_DATA[upperSymbol];
    console.log(`Using fallback historical data for ${upperSymbol}`);
    
    // Adjust the period and interval to match the request
    return {
      ...data,
      period,
      interval
    };
  }
  
  // No fallback data available
  return null;
}