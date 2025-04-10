import axios from 'axios';
import { StockResponse } from '../../shared/schema';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
// Use the correct YFinance API host from the screenshot
const RAPIDAPI_HOST = 'yahoo-finance166.p.rapidapi.com';

// Function to get stock data from Yahoo Finance API
export async function getYahooFinanceData(symbol: string): Promise<StockResponse> {
  try {
    console.log(`Fetching Yahoo Finance data for ${symbol}`);
    
    // Get stock data using the list-by-symbol endpoint as shown in the screenshot
    const response = await axios.get(`https://${RAPIDAPI_HOST}/api/news/list-by-symbol`, {
      params: {
        symbol: symbol,
        region: 'US',
        snippetCount: '10'
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    });

    console.log(`Received basic data for ${symbol}`);
    
    // Get detailed stock data
    const quoteResponse = await axios.get(`https://${RAPIDAPI_HOST}/api/v1/finance/quote`, {
      params: {
        symbols: symbol
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    });

    console.log(`Received quote data for ${symbol}`);
    
    // Extract data from API responses
    const newsData = response.data;
    const quoteData = quoteResponse.data?.quoteResponse?.result?.[0] || {};

    // Process and transform data based on the structure of the new API
    const stockData: StockResponse = {
      symbol: symbol.toUpperCase(),
      name: quoteData.shortName || quoteData.longName || symbol,
      price: quoteData.regularMarketPrice || 0,
      eps: quoteData.epsTrailingTwelveMonths || quoteData.epsForward || 0,
      peRatio: quoteData.trailingPE || quoteData.forwardPE || 0,
      fcfPerShare: calculateFCFPerShare(quoteData),
      growthRate: calculateGrowthRate(quoteData),
      roe: quoteData.returnOnEquity ? quoteData.returnOnEquity * 100 : 10,
      debtToEquity: quoteData.debtToEquity || 0.5,
      currentRatio: quoteData.currentRatio || 1.5,
      revenueGrowth: quoteData.revenueGrowth ? quoteData.revenueGrowth * 100 : 5,
      earningsStability: evaluateEarningsStability(quoteData),
      competitivePosition: evaluateCompetitivePosition(quoteData)
    };

    return stockData;
  } catch (error) {
    console.error('Error fetching Yahoo Finance data:', error);
    throw new Error(`Failed to fetch data for ${symbol}`);
  }
}

// Helper functions to calculate derived metrics adjusted for the new API
function calculateFCFPerShare(quoteData: any): number {
  // Try to calculate FCF per share using available data
  // In this API, we might not have direct FCF data, so we'll estimate
  const eps = quoteData.epsTrailingTwelveMonths || quoteData.epsForward || 0;
  
  // FCF per share is often similar to EPS
  // For a conservative estimate, use 80% of EPS
  return eps * 0.8;
}

function calculateGrowthRate(quoteData: any): number {
  // Try to find growth indicators
  if (quoteData.earningsGrowth) {
    return quoteData.earningsGrowth * 100;
  }
  
  if (quoteData.revenueGrowth) {
    return quoteData.revenueGrowth * 100;
  }
  
  // Use PEG ratio as a hint
  if (quoteData.pegRatio && quoteData.trailingPE) {
    return quoteData.trailingPE / quoteData.pegRatio;
  }
  
  // Use forward vs trailing PE as a growth indicator
  if (quoteData.forwardPE && quoteData.trailingPE && quoteData.forwardPE < quoteData.trailingPE) {
    // Rough estimate based on PE ratio difference
    const difference = (quoteData.trailingPE - quoteData.forwardPE) / quoteData.trailingPE;
    return difference * 100;
  }
  
  // Default growth rate based on market average
  return 8;
}

function evaluateEarningsStability(quoteData: any): 'High' | 'Medium' | 'Low' {
  // Use beta as a proxy for stability
  const beta = quoteData.beta || 1;
  
  // Lower beta typically indicates more stable earnings
  if (beta < 0.8) return 'High';
  if (beta < 1.2) return 'Medium';
  
  // Check other indicators of stability
  const marketCap = quoteData.marketCap || 0;
  const isLargeCap = marketCap > 10000000000; // $10B or more
  
  if (isLargeCap) return 'Medium'; // Large caps tend to be more stable
  
  return 'Low';
}

function evaluateCompetitivePosition(quoteData: any): 'Strong' | 'Good' | 'Average' {
  // Use profit margins as primary indicator
  const profitMargin = quoteData.profitMargins || 0;
  
  // Check for leadership position indicators
  if (profitMargin > 0.15) {
    return 'Strong'; // High profit margins suggest strong competitive position
  }
  
  if (profitMargin > 0.08) {
    return 'Good';
  }
  
  // Consider market cap as secondary indicator
  const marketCap = quoteData.marketCap || 0;
  if (marketCap > 100000000000) { // $100B+
    return 'Good'; // Very large companies often have some competitive advantages
  }
  
  return 'Average';
}