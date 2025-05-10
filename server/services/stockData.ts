import { StockResponse } from '@shared/schema';
import { getYahooFinanceData } from './yahooFinance';
import { getRapidApiStockData } from './rapidApiFinance';

// Simple in-memory cache to reduce API calls
const stockDataCache: { [symbol: string]: { data: StockResponse, timestamp: number } } = {};
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes cache

export async function getStockData(symbol: string): Promise<StockResponse> {
  try {
    // Check if we have valid cached data
    const now = Date.now();
    if (stockDataCache[symbol] && (now - stockDataCache[symbol].timestamp < CACHE_DURATION)) {
      console.log(`Returning cached data for ${symbol}`);
      return stockDataCache[symbol].data;
    }
    
    // Try RapidAPI first (premium API with higher rate limits)
    console.log(`Using RapidAPI to fetch data for ${symbol}`);
    try {
      const rapidApiData = await getRapidApiStockData(symbol);
      
      // Cache the successful response
      stockDataCache[symbol] = {
        data: rapidApiData,
        timestamp: now
      };
      
      return rapidApiData;
    } catch (rapidApiError) {
      console.log(`RapidAPI fetch failed: ${rapidApiError}`);
      console.log(`Falling back to Yahoo Finance...`);
    }
    
    // Fall back to yfinance Python integration
    console.log(`Using yfinance Python integration to fetch data for ${symbol}`);
    try {
      const yahooData = await getYahooFinanceData(symbol);
      
      // Cache the successful response
      stockDataCache[symbol] = {
        data: yahooData,
        timestamp: now
      };
      
      return yahooData;
    } catch (yfinanceError) {
      console.log(`yfinance Python integration failed: ${yfinanceError}`);
      console.log(`All data sources failed for ${symbol}`);
    }
    
    // Return an error for invalid symbols
    console.log(`Stock lookup failed, returning error for ${symbol}`);
    return {
      symbol: symbol,
      name: 'Error',
      price: 0,
      eps: 0,
      peRatio: 0,
      fcfPerShare: 0,
      growthRate: 0,
      roe: 0,
      debtToEquity: 0,
      currentRatio: 0,
      revenueGrowth: 0,
      earningsStability: 'Low',
      competitivePosition: 'Average',
      error: true,
      errorMessage: `Could not find stock with symbol "${symbol}". Please check if the symbol is correct.`
    } as StockResponse;
  } catch (error) {
    console.error('Error aggregating stock data:', error);
    
    // Return an error response that the frontend can handle
    console.log(`API error, returning error for ${symbol}`);
    
    // Create an error response with a clear message
    return {
      symbol: symbol,
      name: 'Error',
      price: 0,
      eps: 0,
      peRatio: 0,
      fcfPerShare: 0,
      growthRate: 0,
      roe: 0,
      debtToEquity: 0,
      currentRatio: 0,
      revenueGrowth: 0,
      earningsStability: 'Low',
      competitivePosition: 'Average',
      error: true,
      errorMessage: `Could not find stock with symbol "${symbol}". Please check if the symbol is correct.`
    } as StockResponse;
  }
}