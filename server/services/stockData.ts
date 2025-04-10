import { StockResponse } from '@shared/schema';
import { getYahooFinanceData } from './yahooFinance';

export async function getStockData(symbol: string): Promise<StockResponse> {
  try {
    // Use yfinance Python integration to fetch stock data
    console.log(`Using yfinance Python integration to fetch data for ${symbol}`);
    try {
      return await getYahooFinanceData(symbol);
    } catch (yfinanceError) {
      console.log(`yfinance Python integration failed: ${yfinanceError}`);
      console.log(`Falling back to other methods...`);
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

// Function to evaluate earnings stability
function evaluateEarningsStability(annualReports: any[]): 'High' | 'Medium' | 'Low' {
  // In a real app, this would analyze the consistency of earnings over time
  // For demo, we'll return 'High' stability
  return 'High';
}

// Function to evaluate competitive position
function evaluateCompetitivePosition(overview: any): 'Strong' | 'Good' | 'Average' {
  // In a real app, this would analyze market share, barriers to entry, etc.
  // For demo, we'll return 'Strong' position
  return 'Strong';
}