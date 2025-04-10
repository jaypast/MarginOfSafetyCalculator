import axios from 'axios';
import { StockResponse } from '../../shared/schema';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'yahoo-finance15.p.rapidapi.com';

// Function to get stock data from Yahoo Finance API
export async function getYahooFinanceData(symbol: string): Promise<StockResponse> {
  try {
    // Get stock summary data
    const summaryResponse = await axios.get(`https://${RAPIDAPI_HOST}/api/yahoo/qu/quote/${symbol}/summary`, {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    });

    // Get key statistics
    const statsResponse = await axios.get(`https://${RAPIDAPI_HOST}/api/yahoo/qu/quote/${symbol}/default-key-statistics`, {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    });

    // Get financial data
    const financialResponse = await axios.get(`https://${RAPIDAPI_HOST}/api/yahoo/qu/quote/${symbol}/financial-data`, {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    });

    const summaryData = summaryResponse.data;
    const statsData = statsResponse.data;
    const financialData = financialResponse.data;

    // Process and transform data
    const stockData: StockResponse = {
      symbol: symbol.toUpperCase(),
      name: summaryData.body.shortName || summaryData.body.longName || symbol,
      price: summaryData.body.regularMarketPrice || 0,
      eps: statsData.body.trailingEps || 0,
      peRatio: summaryData.body.trailingPE || 0,
      fcfPerShare: calculateFCFPerShare(financialData, summaryData),
      growthRate: calculateGrowthRate(financialData, statsData),
      roe: statsData.body.returnOnEquity ? statsData.body.returnOnEquity * 100 : 0,
      debtToEquity: statsData.body.debtToEquity || 0,
      currentRatio: statsData.body.currentRatio || 0,
      revenueGrowth: financialData.body.revenueGrowth ? financialData.body.revenueGrowth * 100 : 0,
      earningsStability: evaluateEarningsStability(statsData),
      competitivePosition: evaluateCompetitivePosition(summaryData, statsData)
    };

    return stockData;
  } catch (error) {
    console.error('Error fetching Yahoo Finance data:', error);
    throw new Error(`Failed to fetch data for ${symbol}`);
  }
}

// Helper functions to calculate derived metrics
function calculateFCFPerShare(financialData: any, summaryData: any): number {
  // If available directly, use it
  if (financialData.body.freeCashflow && summaryData.body.sharesOutstanding) {
    return financialData.body.freeCashflow / summaryData.body.sharesOutstanding;
  }
  
  // Fallback calculation if possible
  if (financialData.body.operatingCashflow && financialData.body.capitalExpenditures && summaryData.body.sharesOutstanding) {
    return (financialData.body.operatingCashflow - Math.abs(financialData.body.capitalExpenditures)) / summaryData.body.sharesOutstanding;
  }
  
  // Default to a reasonable estimate based on EPS if we can't calculate directly
  // This is a rough approximation - FCF is typically 0.5x to 1.5x of EPS
  return (financialData.body.earnings?.earningsPerShare || 0) * 0.8;
}

function calculateGrowthRate(financialData: any, statsData: any): number {
  // Use provided growth rates if available
  if (statsData.body.earningsGrowth) {
    return statsData.body.earningsGrowth * 100;
  }
  
  if (financialData.body.earningsGrowth) {
    return financialData.body.earningsGrowth * 100;
  }
  
  // Fallback to revenue growth rate
  if (financialData.body.revenueGrowth) {
    return financialData.body.revenueGrowth * 100;
  }
  
  // Default to a conservative estimate
  return 3;
}

function evaluateEarningsStability(statsData: any): 'High' | 'Medium' | 'Low' {
  // Use earnings variability if available
  const volatility = statsData.body.earningsQuarterlyGrowth || 0;
  
  if (statsData.body.earningsStability) return statsData.body.earningsStability;
  
  // Higher absolute value of volatility indicates less stability
  if (Math.abs(volatility) > 0.3) return 'Low';
  if (Math.abs(volatility) > 0.1) return 'Medium';
  return 'High';
}

function evaluateCompetitivePosition(summaryData: any, statsData: any): 'Strong' | 'Good' | 'Average' {
  // Factors to consider: market share, profit margins, industry position
  const profitMargin = summaryData.body.profitMargins || 0;
  const grossMargin = statsData.body.grossMargins || 0;
  
  // Evaluate based on profit margins
  if (profitMargin > 0.2 || grossMargin > 0.4) return 'Strong';
  if (profitMargin > 0.1 || grossMargin > 0.3) return 'Good';
  return 'Average';
}