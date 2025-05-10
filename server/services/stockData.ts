import { StockResponse } from '@shared/schema';
import { getYahooFinanceData } from './yahooFinance';
import { getRapidApiStockData } from './rapidApiFinance';
import { scrapeStockData } from './webScraper';
import { getFallbackStockData } from './fallbackData';

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
      console.log(`Trying web scraping as fallback...`);
    }
    
    // Try web scraping as fallback when APIs fail
    try {
      console.log(`Web scraping Yahoo Finance for ${symbol}...`);
      const scrapedData = await scrapeStockData(symbol);
      
      // Cache the successful response
      stockDataCache[symbol] = {
        data: scrapedData,
        timestamp: now
      };
      
      return scrapedData;
    } catch (scrapeError) {
      console.log(`Web scraping failed: ${scrapeError}`);
      console.log(`Checking for static fallback data for ${symbol}...`);
    }
    
    // Try to use static fallback data for common stocks when all APIs and scraping fail
    const fallbackData = getFallbackStockData(symbol);
    if (fallbackData) {
      console.log(`Using static fallback data for ${symbol} as all other methods failed`);
      
      // Cache the fallback data (but with a shorter duration)
      stockDataCache[symbol] = {
        data: fallbackData,
        timestamp: now - (10 * 60 * 1000) // Expires in 5 minutes instead of 15
      };
      
      return fallbackData;
    }
    
    // No data available from any source, return an error
    console.log(`All data sources failed for ${symbol}, no fallback available`);
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
    
    // Try other fallbacks even in case of unexpected errors
    
    // First try web scraping
    try {
      console.log(`Attempting web scraping after error for ${symbol}...`);
      const scrapedData = await scrapeStockData(symbol);
      return scrapedData;
    } catch (scrapeError) {
      console.log(`Web scraping after error failed: ${scrapeError}`);
    }
    
    // Then try static fallback data
    const fallbackData = getFallbackStockData(symbol);
    if (fallbackData) {
      console.log(`Using static fallback data after unexpected error for ${symbol}`);
      return fallbackData;
    }
    
    // Return an error response as a last resort
    console.log(`All recovery methods failed, returning error for ${symbol}`);
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