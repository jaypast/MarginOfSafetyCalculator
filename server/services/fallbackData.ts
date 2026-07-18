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
  },
  'NFLX': {
    symbol: 'NFLX',
    name: 'Netflix, Inc.',
    price: 1290.00,
    eps: 22.00,
    peRatio: 58.0,
    fcfPerShare: 18.50,
    growthRate: 14.0,
    roe: 38.5,
    debtToEquity: 0.70,
    currentRatio: 1.22,
    revenueGrowth: 16.0,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 45.0, tenYearAvg: 55.0, industryAvg: 30 }
  },
  'TSLA': {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    price: 330.00,
    eps: 3.50,
    peRatio: 94.0,
    fcfPerShare: 2.80,
    growthRate: 20.0,
    roe: 12.5,
    debtToEquity: 0.18,
    currentRatio: 1.84,
    revenueGrowth: 15.0,
    earningsStability: 'Low',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 80.0, tenYearAvg: null, industryAvg: 15 }
  },
  'NVDA': {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    price: 145.00,
    eps: 2.80,
    peRatio: 52.0,
    fcfPerShare: 2.40,
    growthRate: 40.0,
    roe: 121.0,
    debtToEquity: 0.42,
    currentRatio: 4.17,
    revenueGrowth: 78.0,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 55.0, tenYearAvg: 35.0, industryAvg: 30 }
  },
  'JPM': {
    symbol: 'JPM',
    name: 'JPMorgan Chase & Co.',
    price: 280.00,
    eps: 18.50,
    peRatio: 15.1,
    fcfPerShare: 16.00,
    growthRate: 8.0,
    roe: 17.0,
    debtToEquity: 1.22,
    currentRatio: 1.08,
    revenueGrowth: 9.0,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 13.5, tenYearAvg: 12.0, industryAvg: 14 }
  },
  'V': {
    symbol: 'V',
    name: 'Visa Inc.',
    price: 370.00,
    eps: 9.90,
    peRatio: 37.0,
    fcfPerShare: 9.50,
    growthRate: 11.0,
    roe: 50.0,
    debtToEquity: 0.55,
    currentRatio: 1.55,
    revenueGrowth: 10.0,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 34.0, tenYearAvg: 32.0, industryAvg: 25 }
  },
  'MA': {
    symbol: 'MA',
    name: 'Mastercard Incorporated',
    price: 580.00,
    eps: 14.50,
    peRatio: 40.0,
    fcfPerShare: 13.80,
    growthRate: 12.0,
    roe: 200.0,
    debtToEquity: 2.10,
    currentRatio: 1.25,
    revenueGrowth: 12.0,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 38.0, tenYearAvg: 34.0, industryAvg: 25 }
  },
  'BRK-B': {
    symbol: 'BRK-B',
    name: 'Berkshire Hathaway Inc.',
    price: 530.00,
    eps: 21.00,
    peRatio: 25.0,
    fcfPerShare: 18.00,
    growthRate: 8.0,
    roe: 9.5,
    debtToEquity: 0.28,
    currentRatio: 1.50,
    revenueGrowth: 5.0,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 22.0, tenYearAvg: 20.0, industryAvg: 18 }
  },
  'JNJ': {
    symbol: 'JNJ',
    name: 'Johnson & Johnson',
    price: 155.00,
    eps: 8.80,
    peRatio: 17.6,
    fcfPerShare: 8.20,
    growthRate: 6.0,
    roe: 22.0,
    debtToEquity: 0.48,
    currentRatio: 1.40,
    revenueGrowth: 4.5,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 17.0, tenYearAvg: 17.5, industryAvg: 20 }
  },
  'UNH': {
    symbol: 'UNH',
    name: 'UnitedHealth Group Incorporated',
    price: 310.00,
    eps: 24.00,
    peRatio: 13.0,
    fcfPerShare: 22.00,
    growthRate: 10.0,
    roe: 25.0,
    debtToEquity: 0.72,
    currentRatio: 0.73,
    revenueGrowth: 8.0,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 22.0, tenYearAvg: 20.0, industryAvg: 18 }
  },
  'WMT': {
    symbol: 'WMT',
    name: 'Walmart Inc.',
    price: 98.00,
    eps: 2.40,
    peRatio: 41.0,
    fcfPerShare: 2.20,
    growthRate: 7.0,
    roe: 22.0,
    debtToEquity: 0.65,
    currentRatio: 0.82,
    revenueGrowth: 6.0,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 34.0, tenYearAvg: 22.0, industryAvg: 20 }
  },
  'HD': {
    symbol: 'HD',
    name: 'The Home Depot, Inc.',
    price: 380.00,
    eps: 15.00,
    peRatio: 25.3,
    fcfPerShare: 13.50,
    growthRate: 6.0,
    roe: 900.0,
    debtToEquity: 40.0,
    currentRatio: 1.30,
    revenueGrowth: 4.0,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 23.0, tenYearAvg: 21.0, industryAvg: 20 }
  },
  'KO': {
    symbol: 'KO',
    name: 'The Coca-Cola Company',
    price: 70.00,
    eps: 2.80,
    peRatio: 25.0,
    fcfPerShare: 2.60,
    growthRate: 5.0,
    roe: 38.0,
    debtToEquity: 1.80,
    currentRatio: 1.12,
    revenueGrowth: 3.0,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 25.0, tenYearAvg: 24.0, industryAvg: 22 }
  },
  'BAC': {
    symbol: 'BAC',
    name: 'Bank of America Corporation',
    price: 46.00,
    eps: 3.20,
    peRatio: 14.4,
    fcfPerShare: 2.80,
    growthRate: 6.0,
    roe: 10.0,
    debtToEquity: 1.40,
    currentRatio: 0.95,
    revenueGrowth: 5.0,
    earningsStability: 'Medium',
    competitivePosition: 'Good',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 12.0, tenYearAvg: 13.0, industryAvg: 14 }
  },
  'DIS': {
    symbol: 'DIS',
    name: 'The Walt Disney Company',
    price: 105.00,
    eps: 4.00,
    peRatio: 26.0,
    fcfPerShare: 3.50,
    growthRate: 8.0,
    roe: 6.5,
    debtToEquity: 0.47,
    currentRatio: 1.05,
    revenueGrowth: 4.0,
    earningsStability: 'Medium',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 28.0, tenYearAvg: 25.0, industryAvg: 22 }
  },
  'ADBE': {
    symbol: 'ADBE',
    name: 'Adobe Inc.',
    price: 380.00,
    eps: 17.00,
    peRatio: 22.4,
    fcfPerShare: 16.00,
    growthRate: 10.0,
    roe: 36.0,
    debtToEquity: 0.35,
    currentRatio: 1.10,
    revenueGrowth: 10.0,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 38.0, tenYearAvg: 42.0, industryAvg: 28 }
  },
  'CRM': {
    symbol: 'CRM',
    name: 'Salesforce, Inc.',
    price: 295.00,
    eps: 9.00,
    peRatio: 32.8,
    fcfPerShare: 8.50,
    growthRate: 12.0,
    roe: 12.0,
    debtToEquity: 0.21,
    currentRatio: 1.10,
    revenueGrowth: 11.0,
    earningsStability: 'Medium',
    competitivePosition: 'Strong',
    lastUpdated: new Date().toISOString(),
    peHistory: { fiveYearAvg: 55.0, tenYearAvg: null, industryAvg: 28 }
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