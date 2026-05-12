import axios from 'axios';
import { StockResponse } from '@shared/schema';
import { HistoricalDataResponse } from './yahooFinance';

// Check if RAPIDAPI_KEY is available
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
if (!RAPIDAPI_KEY) {
  console.warn('RAPIDAPI_KEY is not defined. RapidAPI features will not work properly.');
}

// Yahoo Finance API via RapidAPI - higher rate limits than Twelve Data
const YAHOO_FINANCE_HOST = 'apidojo-yahoo-finance-v1.p.rapidapi.com';

// Simpler API that has more basic data but higher rate limits
const STOCK_DATA_HOST = 'stock-data-yahoo-finance-alternative.p.rapidapi.com';

/**
 * Get real-time stock data using Yahoo Finance API via RapidAPI
 */
export async function getRapidApiStockData(symbol: string): Promise<StockResponse> {
  console.log(`Fetching stock data for ${symbol} using RapidAPI`);
  
  try {
    // First try the Stock Data API (has higher rate limits)
    try {
      return await getStockDataApiInfo(symbol);
    } catch (error) {
      console.log(`Stock Data API failed, trying Yahoo Finance API: ${error}`);
    }
    
    // Fall back to Yahoo Finance API via RapidAPI
    return await getYahooFinanceApiInfo(symbol);
  } catch (error: any) {
    console.error('Error fetching RapidAPI stock data:', error.message);
    throw new Error(`Failed to fetch data for ${symbol} via RapidAPI`);
  }
}

/**
 * Get historical price data using Yahoo Finance API via RapidAPI
 */
export async function getRapidApiHistoricalData(
  symbol: string,
  period: string = '5y',
  interval: string = '1mo'
): Promise<HistoricalDataResponse> {
  console.log(`Fetching historical data for ${symbol} (${period}, ${interval}) using RapidAPI`);
  
  try {
    // Map our period format to Yahoo interval format
    const { range, yahooInterval } = mapToYahooParams(period, interval);
    
    // Use Yahoo Finance API for historical data
    const response = await axios.get(`https://${YAHOO_FINANCE_HOST}/stock/v3/get-historical-data`, {
      params: {
        symbol,
        region: 'US'
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': YAHOO_FINANCE_HOST
      }
    });
    
    const data = response.data;
    
    if (!data || !data.prices || data.prices.length === 0) {
      throw new Error(`Failed to fetch historical data for ${symbol}`);
    }
    
    // Transform data to match our HistoricalDataResponse format
    let historicalData: HistoricalDataResponse = {
      symbol,
      period,
      interval,
      data: data.prices
        .filter((item: any) => !item.type) // Remove splits and dividends
        .map((item: any) => ({
          date: new Date(item.date * 1000).toISOString().split('T')[0],
          open: item.open || 0,
          high: item.high || 0,
          low: item.low || 0,
          close: item.close || 0,
          volume: item.volume || 0
        }))
    };
    
    // Filter data based on the period requested
    historicalData.data = filterDataByPeriod(historicalData.data, period);
    
    // Sort data chronologically (oldest to newest)
    historicalData.data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    console.log(`Successfully received historical data for ${symbol} from RapidAPI`);
    return historicalData;
    
  } catch (error: any) {
    console.error('Error fetching historical data from RapidAPI:', error.message);
    throw new Error(`Failed to fetch historical data for ${symbol} via RapidAPI`);
  }
}

// Helper functions for API requests

/**
 * Get stock data from Stock Data API (higher rate limits)
 */
async function getStockDataApiInfo(symbol: string): Promise<StockResponse> {
  const response = await axios.get(`https://${STOCK_DATA_HOST}/price`, {
    params: {
      symbol,
      period: '1d'
    },
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': STOCK_DATA_HOST
    }
  });
  
  const data = response.data;
  
  if (!data || data.error) {
    throw new Error(data?.message || `Failed to fetch stock data for ${symbol}`);
  }
  
  // Get company profile for additional info
  let companyData: CompanyProfile = {};
  try {
    const profileResponse = await axios.get(`https://${STOCK_DATA_HOST}/profile`, {
      params: { symbol },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': STOCK_DATA_HOST
      }
    });
    companyData = profileResponse.data || {};
  } catch (err) {
    console.warn(`Couldn't fetch company profile for ${symbol}, using limited data`);
  }
  
  // Market cap — the Stock Data API exposes marketCap as a raw number.
  const marketCap: number | null =
    typeof data.marketCap === 'number' && data.marketCap > 0
      ? data.marketCap
      : null;

  // 52-week range — wire into multibaggerSignals when the endpoint
  // provides it (field presence varies by ticker / plan) (Task #38).
  const sdWeek52High: number | null =
    typeof data.fiftyTwoWeekHigh === 'number' && data.fiftyTwoWeekHigh > 0
      ? data.fiftyTwoWeekHigh
      : null;
  const sdWeek52Low: number | null =
    typeof data.fiftyTwoWeekLow === 'number' && data.fiftyTwoWeekLow > 0
      ? data.fiftyTwoWeekLow
      : null;

  // Combine and transform the data to match our StockResponse schema
  const stockData: StockResponse = {
    symbol: symbol,
    name: companyData.companyName || symbol,
    price: data.regularMarketPrice || 0,
    
    // Financial metrics - extract from different API responses
    eps: data.epsTrailingTwelveMonths || 0,
    peRatio: data.regularMarketPriceToEarnings || 0,
    fcfPerShare: data.freeCashflowPerShare || 0,
    growthRate: estimateGrowthRate(data, companyData),
    roe: data.returnOnEquity || companyData.returnOnEquity || 0,
    debtToEquity: data.debtToEquity || companyData.debtToEquity || 0,
    currentRatio: data.currentRatio || companyData.currentRatio || 0,
    revenueGrowth: data.revenueGrowth || companyData.revenueGrowth || 0,
    
    // Quality metrics - calculate based on available data
    earningsStability: evaluateEarningsStability(data, companyData),
    competitivePosition: evaluateCompetitivePosition(data, companyData),
    
    // Last updated timestamp
    lastUpdated: new Date().toISOString(),
    // RapidAPI's Stock Data endpoint doesn't expose enough quarterly
    // EPS history to compute trailing-twelve-month medians. Emit
    // explicit null so the API contract stays uniform (Task #15).
    peHistory: null,
    // Stock Data API exposes fiftyTwoWeekHigh/Low when available;
    // wire into multibaggerSignals for the range sub-score (Task #38).
    multibaggerSignals: {
      fcfYield: null,
      assetGrowth: null,
      ebitdaGrowth: null,
      week52High: sdWeek52High,
      week52Low: sdWeek52Low,
    },
    // Market cap from the Stock Data API price response (Task #37).
    marketCap,
  };
  
  console.log(`Successfully received Stock Data API data for ${symbol}`);
  return stockData;
}

/**
 * Get stock data from Yahoo Finance API via RapidAPI (backup option)
 */
async function getYahooFinanceApiInfo(symbol: string): Promise<StockResponse> {
  // Get quote information
  const quoteResponse = await axios.get(`https://${YAHOO_FINANCE_HOST}/stock/v2/get-summary`, {
    params: {
      symbol,
      region: 'US'
    },
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': YAHOO_FINANCE_HOST
    }
  });
  
  const quoteData = quoteResponse.data;
  
  if (!quoteData) {
    throw new Error(`Failed to fetch quote data for ${symbol}`);
  }
  
  // Extract key information from the complex Yahoo Finance response
  const price = quoteData.price || {};
  const financialData = quoteData.financialData || {};
  const defaultKeyStatistics = quoteData.defaultKeyStatistics || {};
  
  // Market cap from the Yahoo Finance summary price block (Task #37).
  const yahooMarketCap: number | null =
    typeof price.marketCap?.raw === 'number' && price.marketCap.raw > 0
      ? price.marketCap.raw
      : null;

  // Combine and transform the data to match our StockResponse schema
  const stockData: StockResponse = {
    symbol: symbol,
    name: price.longName || price.shortName || symbol,
    price: price.regularMarketPrice?.raw || 0,
    
    // Financial metrics
    eps: defaultKeyStatistics.trailingEps?.raw || 0,
    peRatio: defaultKeyStatistics.forwardPE?.raw || 0,
    fcfPerShare: financialData.freeCashflow?.raw 
      ? financialData.freeCashflow.raw / (defaultKeyStatistics.sharesOutstanding?.raw || 1)
      : 0,
    growthRate: financialData.revenueGrowth?.raw || defaultKeyStatistics.earningsGrowth?.raw || 0,
    roe: financialData.returnOnEquity?.raw || 0,
    debtToEquity: financialData.debtToEquity?.raw || 0,
    currentRatio: financialData.currentRatio?.raw || 0,
    revenueGrowth: financialData.revenueGrowth?.raw || 0,
    
    // Quality metrics
    earningsStability: evaluateEarningsStabilityYahoo(quoteData),
    competitivePosition: evaluateCompetitivePositionYahoo(quoteData),
    
    // Last updated timestamp
    lastUpdated: new Date().toISOString(),
    // Yahoo's RapidAPI quote endpoint doesn't return historical
    // quarterly EPS — emit explicit null for uniform contract (Task #15).
    peHistory: null,
    // Yahoo Finance summary exposes fiftyTwoWeekHigh/Low in
    // defaultKeyStatistics; wire them for the range sub-score (Task #38).
    multibaggerSignals: {
      fcfYield: null,
      assetGrowth: null,
      ebitdaGrowth: null,
      week52High: typeof defaultKeyStatistics.fiftyTwoWeekHigh?.raw === 'number' && defaultKeyStatistics.fiftyTwoWeekHigh.raw > 0
        ? defaultKeyStatistics.fiftyTwoWeekHigh.raw
        : null,
      week52Low: typeof defaultKeyStatistics.fiftyTwoWeekLow?.raw === 'number' && defaultKeyStatistics.fiftyTwoWeekLow.raw > 0
        ? defaultKeyStatistics.fiftyTwoWeekLow.raw
        : null,
    },
    // Market cap from Yahoo Finance price block (Task #37).
    marketCap: yahooMarketCap,
  };
  
  console.log(`Successfully received Yahoo Finance API data for ${symbol}`);
  return stockData;
}

// Company profile interface (defined outside function scope)
interface CompanyProfile {
  companyName?: string;
  returnOnEquity?: number;
  debtToEquity?: number;
  currentRatio?: number;
  revenueGrowth?: number;
  grossMargin?: number;
  operatingMargin?: number;
  earningsGrowth?: number;
  [key: string]: any; // Allow for other properties
}

// Helper functions for data transformation and analysis

function estimateGrowthRate(data: any, companyData: CompanyProfile): number {
  // Estimate growth rate from available data
  const earningsGrowth = data.earningsGrowth || companyData.earningsGrowth || 0;
  const revenueGrowth = data.revenueGrowth || companyData.revenueGrowth || 0;
  
  return earningsGrowth || revenueGrowth || 0;
}

function evaluateEarningsStability(data: any, companyData: CompanyProfile): 'High' | 'Medium' | 'Low' {
  // Evaluate earnings stability based on available data
  const grossMargin = data.grossMargin || companyData.grossMargin || 0;
  const operatingMargin = data.operatingMargin || companyData.operatingMargin || 0;
  
  // High stability: good margins and consistent profitability
  if (grossMargin > 0.3 && operatingMargin > 0.15) {
    return 'High';
  }
  
  // Medium stability: decent margins
  if (grossMargin > 0.2 && operatingMargin > 0.08) {
    return 'Medium';
  }
  
  // Low stability: poor or inconsistent margins
  return 'Low';
}

function evaluateEarningsStabilityYahoo(data: any): 'High' | 'Medium' | 'Low' {
  const financialData = data.financialData || {};
  
  // Extract margins from Yahoo Finance data
  const grossMargin = financialData.grossMargins?.raw || 0;
  const operatingMargin = financialData.operatingMargins?.raw || 0;
  const recommendationKey = financialData.recommendationKey;
  
  // High stability: good margins and strong buy/hold recommendations
  if (grossMargin > 0.3 && operatingMargin > 0.15 && 
      (recommendationKey === 'buy' || recommendationKey === 'strong_buy')) {
    return 'High';
  }
  
  // Medium stability: decent margins
  if (grossMargin > 0.2 && operatingMargin > 0.08) {
    return 'Medium';
  }
  
  // Low stability: poor or inconsistent margins
  return 'Low';
}

function evaluateCompetitivePosition(data: any, companyData: CompanyProfile): 'Strong' | 'Good' | 'Average' {
  // Evaluate competitive position based on available data
  const roe = data.returnOnEquity || companyData.returnOnEquity || 0;
  const operatingMargin = data.operatingMargin || companyData.operatingMargin || 0;
  
  // Strong position: high returns and margins
  if (roe > 0.20 && operatingMargin > 0.15) {
    return 'Strong';
  }
  
  // Good position: solid returns and margins
  if (roe > 0.12 && operatingMargin > 0.10) {
    return 'Good';
  }
  
  // Average position: adequate returns and margins
  return 'Average';
}

function evaluateCompetitivePositionYahoo(data: any): 'Strong' | 'Good' | 'Average' {
  const financialData = data.financialData || {};
  
  // Extract key metrics from Yahoo Finance data
  const roe = financialData.returnOnEquity?.raw || 0;
  const operatingMargin = financialData.operatingMargins?.raw || 0;
  const recommendationMean = financialData.recommendationMean?.raw || 3;
  
  // Strong position: high returns, margins, and analyst recommendations
  if (roe > 0.20 && operatingMargin > 0.15 && recommendationMean < 2) {
    return 'Strong';
  }
  
  // Good position: solid returns and margins
  if (roe > 0.12 && operatingMargin > 0.10 && recommendationMean < 2.5) {
    return 'Good';
  }
  
  // Average position: adequate returns and margins
  return 'Average';
}

function mapToYahooParams(period: string, interval: string): { range: string, yahooInterval: string } {
  // Convert our period format to Yahoo Finance format
  let range = '5y';
  let yahooInterval = '1mo';
  
  switch (period) {
    case '5y':
      range = '5y';
      break;
    case '2y':
      range = '2y';
      break;
    case '1y':
      range = '1y';
      break;
    default:
      range = '5y';
  }
  
  switch (interval) {
    case '1d':
      yahooInterval = '1d';
      break;
    case '1wk':
      yahooInterval = '1wk';
      break;
    case '1mo':
      yahooInterval = '1mo';
      break;
    default:
      yahooInterval = '1mo';
  }
  
  return { range, yahooInterval };
}

function filterDataByPeriod(data: any[], period: string): any[] {
  // Filter data based on the requested period
  const now = new Date();
  let cutoffDate = new Date();
  
  switch (period) {
    case '5y':
      cutoffDate.setFullYear(now.getFullYear() - 5);
      break;
    case '2y':
      cutoffDate.setFullYear(now.getFullYear() - 2);
      break;
    case '1y':
      cutoffDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      cutoffDate.setFullYear(now.getFullYear() - 5);
  }
  
  return data.filter(item => new Date(item.date) >= cutoffDate);
}