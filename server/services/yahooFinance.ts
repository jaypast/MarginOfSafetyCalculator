import axios from 'axios';
import { StockResponse } from '../../shared/schema';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
// Switch to a different Yahoo Finance API on RapidAPI
const RAPIDAPI_HOST = 'apidojo-yahoo-finance-v1.p.rapidapi.com';

// Function to get stock data from Yahoo Finance API
export async function getYahooFinanceData(symbol: string): Promise<StockResponse> {
  try {
    console.log(`Fetching Yahoo Finance data for ${symbol}`);
    
    // Get stock summary data (overview)
    const summaryResponse = await axios.get(`https://${RAPIDAPI_HOST}/stock/v2/get-summary`, {
      params: {
        symbol: symbol,
        region: 'US'
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    });

    // Get quote data
    const quoteResponse = await axios.get(`https://${RAPIDAPI_HOST}/market/v2/get-quotes`, {
      params: {
        symbols: symbol,
        region: 'US'
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    });

    // Log responses for debugging
    console.log(`Received data for ${symbol}`);
    
    const summaryData = summaryResponse.data;
    const quoteData = quoteResponse.data.quoteResponse.result[0];

    // Process and transform data based on the structure of the API responses
    const stockData: StockResponse = {
      symbol: symbol.toUpperCase(),
      name: quoteData.shortName || quoteData.longName || symbol,
      price: quoteData.regularMarketPrice || 0,
      eps: summaryData.defaultKeyStatistics?.trailingEps?.raw || 0,
      peRatio: summaryData.summaryDetail?.trailingPE?.raw || 0,
      fcfPerShare: calculateFCFPerShare(summaryData),
      growthRate: calculateGrowthRate(summaryData),
      roe: summaryData.financialData?.returnOnEquity?.raw ? summaryData.financialData.returnOnEquity.raw * 100 : 10,
      debtToEquity: summaryData.financialData?.debtToEquity?.raw || 0.5,
      currentRatio: summaryData.financialData?.currentRatio?.raw || 1.5,
      revenueGrowth: summaryData.financialData?.revenueGrowth?.raw ? summaryData.financialData.revenueGrowth.raw * 100 : 5,
      earningsStability: evaluateEarningsStability(summaryData),
      competitivePosition: evaluateCompetitivePosition(summaryData)
    };

    return stockData;
  } catch (error) {
    console.error('Error fetching Yahoo Finance data:', error);
    throw new Error(`Failed to fetch data for ${symbol}`);
  }
}

// Helper functions to calculate derived metrics adjusted for the new API
function calculateFCFPerShare(summaryData: any): number {
  // Try to calculate FCF per share using available data
  const freeCashflow = summaryData.financialData?.freeCashflow?.raw;
  const operatingCashflow = summaryData.financialData?.operatingCashflow?.raw;
  const capitalExpenditures = summaryData.financialData?.capitalExpenditures?.raw;
  const sharesOutstanding = summaryData.defaultKeyStatistics?.sharesOutstanding?.raw;
  
  // If we have all the data to calculate directly
  if (freeCashflow && sharesOutstanding) {
    return freeCashflow / sharesOutstanding;
  }
  
  // Alternative calculation
  if (operatingCashflow && capitalExpenditures && sharesOutstanding) {
    return (operatingCashflow - Math.abs(capitalExpenditures)) / sharesOutstanding;
  }
  
  // Default to a reasonable estimate based on EPS
  const eps = summaryData.defaultKeyStatistics?.trailingEps?.raw || 0;
  return eps * 0.8; // FCF is typically 0.5x to 1.5x of EPS
}

function calculateGrowthRate(summaryData: any): number {
  // Try different sources for growth rate in order of preference
  const earningsGrowth = summaryData.financialData?.earningsGrowth?.raw;
  const revenueGrowth = summaryData.financialData?.revenueGrowth?.raw;
  const pegRatio = summaryData.defaultKeyStatistics?.pegRatio?.raw;
  
  if (earningsGrowth) {
    return earningsGrowth * 100;
  }
  
  if (revenueGrowth) {
    return revenueGrowth * 100;
  }
  
  // Use PEG ratio as a hint for growth if available
  if (pegRatio && summaryData.summaryDetail?.trailingPE?.raw) {
    return summaryData.summaryDetail.trailingPE.raw / pegRatio;
  }
  
  // Conservative default
  return 8;
}

function evaluateEarningsStability(summaryData: any): 'High' | 'Medium' | 'Low' {
  // Check earnings variability or consistency metrics
  const earningsQuarterlyGrowth = summaryData.defaultKeyStatistics?.earningsQuarterlyGrowth?.raw;
  const beta = summaryData.defaultKeyStatistics?.beta?.raw || 1;
  
  // Use beta as a proxy for stability if no direct measure available
  if (beta < 0.8) return 'High';
  if (beta < 1.2) return 'Medium';
  
  // Default for most stocks
  return 'Medium';
}

function evaluateCompetitivePosition(summaryData: any): 'Strong' | 'Good' | 'Average' {
  // Get profitability metrics
  const profitMargin = summaryData.financialData?.profitMargins?.raw || 0;
  const grossMargin = summaryData.financialData?.grossMargins?.raw || 0;
  const operatingMargin = summaryData.financialData?.operatingMargins?.raw || 0;
  
  // Check for moat indicators
  if (profitMargin > 0.2 || grossMargin > 0.4 || operatingMargin > 0.3) {
    return 'Strong';
  }
  
  if (profitMargin > 0.1 || grossMargin > 0.3 || operatingMargin > 0.15) {
    return 'Good';
  }
  
  return 'Average';
}