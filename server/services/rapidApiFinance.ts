import axios from 'axios';
import { StockResponse } from '@shared/schema';
import { HistoricalDataResponse } from './yahooFinance';

// Check if RAPIDAPI_KEY is available
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
if (!RAPIDAPI_KEY) {
  console.warn('RAPIDAPI_KEY is not defined. RapidAPI features will not work properly.');
}

// This API has a very high rate limit (500 requests per day) and good stock data coverage
// It returns data very similar to Yahoo Finance
const TWELVE_DATA_HOST = 'twelve-data1.p.rapidapi.com';

/**
 * Get real-time stock data using Twelve Data API via RapidAPI
 */
export async function getRapidApiStockData(symbol: string): Promise<StockResponse> {
  console.log(`Fetching stock data for ${symbol} using RapidAPI`);
  
  try {
    // Get basic quote information
    const quoteResponse = await axios.get(`https://${TWELVE_DATA_HOST}/quote`, {
      params: { symbol },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': TWELVE_DATA_HOST
      }
    });
    
    const quoteData = quoteResponse.data;
    
    if (!quoteData || quoteData.error) {
      throw new Error(quoteData?.message || `Failed to fetch quote data for ${symbol}`);
    }
    
    // Get financial ratios for more detailed analysis
    const ratiosResponse = await axios.get(`https://${TWELVE_DATA_HOST}/financial_ratios`, {
      params: { symbol },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': TWELVE_DATA_HOST
      }
    });
    
    const ratiosData = ratiosResponse.data;
    
    // Combine and transform the data to match our StockResponse schema
    const stockData: StockResponse = {
      symbol: symbol,
      name: quoteData.name || 'Unknown',
      price: parseFloat(quoteData.close) || 0,
      
      // Financial metrics - extract from different API responses
      eps: parseFloat(ratiosData?.eps?.quarterly || 0) || 0,
      peRatio: parseFloat(quoteData.pe_ratio) || 0,
      fcfPerShare: calculateFcfPerShare(ratiosData),
      growthRate: calculateGrowthRate(ratiosData),
      roe: parseFloat(ratiosData?.roe?.quarterly || 0) || 0,
      debtToEquity: parseFloat(ratiosData?.debt_to_equity?.quarterly || 0) || 0,
      currentRatio: parseFloat(ratiosData?.current_ratio?.quarterly || 0) || 0,
      revenueGrowth: parseFloat(ratiosData?.revenue_growth?.quarterly || 0) || 0,
      
      // Quality metrics - calculate based on available data
      earningsStability: evaluateEarningsStability(ratiosData),
      competitivePosition: evaluateCompetitivePosition(ratiosData),
      
      // Last updated timestamp
      lastUpdated: quoteData.datetime || new Date().toISOString()
    };
    
    console.log(`Successfully received RapidAPI data for ${symbol}`);
    return stockData;
    
  } catch (error: any) {
    console.error('Error fetching RapidAPI stock data:', error.message);
    throw new Error(`Failed to fetch data for ${symbol} via RapidAPI`);
  }
}

/**
 * Get historical price data using RapidAPI
 */
export async function getRapidApiHistoricalData(
  symbol: string,
  period: string = '5y',
  interval: string = '1mo'
): Promise<HistoricalDataResponse> {
  console.log(`Fetching historical data for ${symbol} (${period}, ${interval}) using RapidAPI`);
  
  try {
    // Convert period to interval and count for the API
    const { apiInterval, outputInterval } = convertPeriodToInterval(interval);
    const count = calculateTimeSeriesCount(period, apiInterval);
    
    const response = await axios.get(`https://${TWELVE_DATA_HOST}/time_series`, {
      params: {
        symbol,
        interval: apiInterval,
        outputsize: count
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': TWELVE_DATA_HOST
      }
    });
    
    const data = response.data;
    
    if (!data || data.error) {
      throw new Error(data?.message || `Failed to fetch historical data for ${symbol}`);
    }
    
    // Transform data to match our HistoricalDataResponse format
    const values = data.values || [];
    const historicalData: HistoricalDataResponse = {
      symbol,
      period,
      interval: outputInterval,
      data: values.map((item: any) => ({
        date: item.datetime,
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: parseFloat(item.close),
        volume: parseFloat(item.volume)
      }))
    };
    
    // Sort data chronologically
    historicalData.data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    console.log(`Successfully received historical data for ${symbol} from RapidAPI`);
    return historicalData;
    
  } catch (error: any) {
    console.error('Error fetching historical data from RapidAPI:', error.message);
    throw new Error(`Failed to fetch historical data for ${symbol} via RapidAPI`);
  }
}

// Helper functions for data transformation and analysis

function calculateFcfPerShare(ratiosData: any): number {
  // Estimate FCF per share from available data
  // This is a simplified calculation based on operating cash flow and capital expenditures
  const cashFlowPerShare = parseFloat(ratiosData?.cash_flow_per_share?.quarterly || 0);
  return cashFlowPerShare > 0 ? cashFlowPerShare : 0;
}

function calculateGrowthRate(ratiosData: any): number {
  // Estimate growth rate from available data
  // Use earnings growth rate if available, otherwise revenue growth rate
  const earningsGrowth = parseFloat(ratiosData?.earnings_growth?.quarterly || 0);
  const revenueGrowth = parseFloat(ratiosData?.revenue_growth?.quarterly || 0);
  
  return earningsGrowth || revenueGrowth || 0;
}

function evaluateEarningsStability(ratiosData: any): 'High' | 'Medium' | 'Low' {
  // Evaluate earnings stability based on ratios
  const grossMargin = parseFloat(ratiosData?.gross_margin?.quarterly || 0);
  const operatingMargin = parseFloat(ratiosData?.operating_margin?.quarterly || 0);
  
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

function evaluateCompetitivePosition(ratiosData: any): 'Strong' | 'Good' | 'Average' {
  // Evaluate competitive position based on ratios
  const roe = parseFloat(ratiosData?.roe?.quarterly || 0);
  const operatingMargin = parseFloat(ratiosData?.operating_margin?.quarterly || 0);
  
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

function convertPeriodToInterval(interval: string): { apiInterval: string, outputInterval: string } {
  // Convert our interval format to the API's interval format
  switch (interval) {
    case '1d':
      return { apiInterval: '1day', outputInterval: '1d' };
    case '1wk':
      return { apiInterval: '1week', outputInterval: '1wk' };
    case '1mo':
      return { apiInterval: '1month', outputInterval: '1mo' };
    default:
      return { apiInterval: '1month', outputInterval: '1mo' };
  }
}

function calculateTimeSeriesCount(period: string, interval: string): number {
  // Calculate the number of data points needed based on period and interval
  switch (period) {
    case '5y':
      return interval === '1day' ? 1250 : interval === '1week' ? 260 : 60;
    case '2y':
      return interval === '1day' ? 500 : interval === '1week' ? 104 : 24;
    case '1y':
      return interval === '1day' ? 250 : interval === '1week' ? 52 : 12;
    default:
      return 60; // Default to 5 years of monthly data
  }
}