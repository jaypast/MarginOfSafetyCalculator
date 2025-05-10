import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { StockResponse } from '@shared/schema';
import { HistoricalDataResponse } from './yahooFinance';

// Add delay function to space out requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Create more realistic browser headers that change slightly between requests
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.1661.62',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
  ];
  
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Get real-time stock quote from a simpler API
 * This should bypass complex website scraping issues
 */
async function getSimpleQuote(symbol: string): Promise<{price: number, name: string}> {
  try {
    // Try a simpler API endpoint that's less likely to be blocked
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d`, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com/',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch JSON quote for ${symbol}`);
    }
    
    const data = await response.json();
    
    // Extract the current price with proper type checking
    const chartData = data as any;
    const price = chartData?.chart?.result?.[0]?.meta?.regularMarketPrice || 0;
    const name = chartData?.chart?.result?.[0]?.meta?.shortName || symbol;
    
    return { price, name };
  } catch (error) {
    console.error('Error fetching simple quote:', error);
    throw error;
  }
}

/**
 * Web scraper to extract stock data directly from Yahoo Finance website
 * This bypasses API rate limits by scraping the data directly from the website
 */
export async function scrapeStockData(symbol: string): Promise<StockResponse> {
  console.log(`Scraping Yahoo Finance website for ${symbol}`);
  
  try {
    // First try to get the current price using the simple API
    const { price, name } = await getSimpleQuote(symbol);
    
    // Add a small delay to space out requests
    await delay(500);
    
    // Fetch the summary page for the stock symbol
    const response = await fetch(`https://finance.yahoo.com/quote/${symbol}`, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'DNT': '1'
      }
    });
    
    // Add another delay before the next request
    await delay(800);
    
    // Get statistics page for more detailed metrics
    const statsResponse = await fetch(`https://finance.yahoo.com/quote/${symbol}/key-statistics`, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Referer': `https://finance.yahoo.com/quote/${symbol}`,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'DNT': '1'
      }
    });
    
    // Parse the pages if successful
    const html = response.ok ? await response.text() : '';
    const $ = cheerio.load(html);
    
    const statsHtml = statsResponse.ok ? await statsResponse.text() : '';
    const stats$ = cheerio.load(statsHtml);
    
    // Extract key metrics from the statistics page
    const metricsMap: Record<string, string> = {};
    stats$('tr').each((_, row) => {
      const label = stats$(row).find('td:nth-child(1)').text().trim();
      const value = stats$(row).find('td:nth-child(2)').text().trim();
      if (label && value) {
        metricsMap[label] = value;
      }
    });
    
    // Parse the metrics we need (with fallbacks for missing data)
    const eps = parseNumber(metricsMap['Trailing EPS'] || metricsMap['Diluted EPS'] || '0');
    const peRatio = parseNumber(metricsMap['Trailing P/E'] || metricsMap['Forward P/E'] || '0');
    const roe = parseNumber(metricsMap['Return on Equity'] || '0');
    const debtToEquity = parseNumber(metricsMap['Total Debt/Equity'] || '0');
    const currentRatio = parseNumber(metricsMap['Current Ratio'] || '0');
    const revenueGrowth = parsePercentage(metricsMap['Revenue Growth (yoy)'] || metricsMap['Quarterly Revenue Growth (yoy)'] || '0%');
    const growthRate = parsePercentage(metricsMap['EPS Growth (yoy)'] || metricsMap['Quarterly Earnings Growth (yoy)'] || '0%');
    
    // Calculate FCF per share (if available)
    const freeCashFlow = parseNumber(metricsMap['Levered Free Cash Flow'] || '0') * 1000000; // Usually in millions
    const outstandingShares = parseNumber(metricsMap['Shares Outstanding'] || metricsMap['Float'] || '0') * 1000000; // Usually in millions
    const fcfPerShare = outstandingShares > 0 ? freeCashFlow / outstandingShares : 0;
    
    // Evaluate earnings stability and competitive position
    const earningsStability = evaluateEarningsStability(metricsMap);
    const competitivePosition = evaluateCompetitivePosition(roe, currentRatio, metricsMap);
    
    // Use the data from the simpler API which is more likely to work
    const stockData: StockResponse = {
      symbol,
      name: name, // Use name from the chart API
      price: price, // Use price from the chart API
      eps,
      peRatio,
      fcfPerShare,
      growthRate,
      roe,
      debtToEquity,
      currentRatio,
      revenueGrowth,
      earningsStability,
      competitivePosition,
      lastUpdated: new Date().toISOString()
    };
    
    // Fill in reasonable defaults for missing values
    if (stockData.eps === 0 && stockData.price > 0 && stockData.peRatio > 0) {
      stockData.eps = stockData.price / stockData.peRatio;
    }
    
    if (stockData.peRatio === 0 && stockData.price > 0 && stockData.eps > 0) {
      stockData.peRatio = stockData.price / stockData.eps;
    }
    
    console.log(`Successfully scraped data for ${symbol}: ${price}`);
    return stockData;
    
  } catch (error: any) {
    console.error('Error scraping Yahoo Finance:', error.message);
    throw new Error(`Failed to scrape data for ${symbol}`);
  }
}

/**
 * Get historical data directly from Yahoo Finance API endpoint
 * This is more reliable than scraping the website
 */
export async function scrapeHistoricalData(
  symbol: string,
  period: string = '5y',
  interval: string = '1mo'
): Promise<HistoricalDataResponse> {
  console.log(`Scraping historical data for ${symbol} (${period}, ${interval})`);
  
  try {
    // Convert period and interval to Yahoo Finance format
    const yahooInterval = convertToYahooInterval(interval);
    const yahooRange = convertToYahooRange(period);
    
    // Use the chart API endpoint to get historical data
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${yahooRange}&interval=${yahooInterval}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com/',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch historical data for ${symbol}`);
    }
    
    const data = await response.json();
    const chartData = data as any;
    const result = chartData?.chart?.result?.[0];
    
    if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
      throw new Error(`Invalid historical data format for ${symbol}`);
    }
    
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];
    
    // Map the data to our format
    const historicalData: HistoricalDataResponse['data'] = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      if (!timestamp) continue;
      
      const date = new Date(timestamp * 1000);
      const open = quotes.open?.[i] ?? null;
      const high = quotes.high?.[i] ?? null;
      const low = quotes.low?.[i] ?? null;
      const close = quotes.close?.[i] ?? null;
      const volume = quotes.volume?.[i] ?? 0;
      
      // Skip entries with null values
      if (open !== null && high !== null && low !== null && close !== null) {
        historicalData.push({
          date: date.toISOString().split('T')[0],
          open,
          high,
          low,
          close,
          volume
        });
      }
    }
    
    console.log(`Successfully retrieved historical data for ${symbol} via API`);
    return {
      symbol,
      period,
      interval,
      data: historicalData
    };
    
  } catch (error: any) {
    console.error('Error scraping historical data:', error.message);
    throw new Error(`Failed to scrape historical data for ${symbol}`);
  }
}

// Helper functions

function parseNumber(value: string): number {
  if (!value) return 0;
  
  // Handle thousands, millions, billions
  const multiplier = value.includes('T') ? 1e12 :
                     value.includes('B') ? 1e9 :
                     value.includes('M') ? 1e6 :
                     value.includes('K') ? 1e3 : 1;
  
  // Extract the number and convert to float
  const cleanedValue = value.replace(/[^0-9.-]/g, '');
  return parseFloat(cleanedValue) * multiplier || 0;
}

function parsePercentage(value: string): number {
  if (!value) return 0;
  const cleanedValue = value.replace(/[^0-9.-]/g, '');
  return parseFloat(cleanedValue) || 0;
}

function evaluateEarningsStability(metrics: Record<string, string>): 'High' | 'Medium' | 'Low' {
  const profitMargin = parsePercentage(metrics['Profit Margin'] || '0%');
  const operatingMargin = parsePercentage(metrics['Operating Margin'] || '0%');
  const returnOnAssets = parsePercentage(metrics['Return on Assets'] || '0%');
  
  // High stability: good margins and returns
  if (profitMargin > 15 && operatingMargin > 20 && returnOnAssets > 10) {
    return 'High';
  }
  
  // Medium stability: decent margins
  if (profitMargin > 8 && operatingMargin > 10) {
    return 'Medium';
  }
  
  // Low stability: poor or inconsistent margins
  return 'Low';
}

function evaluateCompetitivePosition(roe: number, currentRatio: number, metrics: Record<string, string>): 'Strong' | 'Good' | 'Average' {
  const grossMargin = parsePercentage(metrics['Gross Margin'] || '0%');
  const marketCap = parseNumber(metrics['Market Cap'] || '0');
  
  // Strong position: high returns, good liquidity, large market cap
  if (roe > 20 && currentRatio > 1.5 && grossMargin > 40 && marketCap > 50e9) {
    return 'Strong';
  }
  
  // Good position: solid returns and liquidity
  if (roe > 15 && currentRatio > 1.2 && grossMargin > 30) {
    return 'Good';
  }
  
  // Average position: adequate metrics
  return 'Average';
}

function convertToYahooInterval(interval: string): string {
  switch (interval) {
    case '1d': return '1d';
    case '1wk': return '1wk';
    case '1mo': return '1mo';
    default: return '1mo';
  }
}

function convertToYahooRange(period: string): string {
  switch (period) {
    case '5y': return '5y';
    case '2y': return '2y';
    case '1y': return '1y';
    default: return '5y';
  }
}

function getStartTimestamp(period: string): number {
  const now = new Date();
  let startDate = new Date();
  
  switch (period) {
    case '5y':
      startDate.setFullYear(now.getFullYear() - 5);
      break;
    case '2y':
      startDate.setFullYear(now.getFullYear() - 2);
      break;
    case '1y':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate.setFullYear(now.getFullYear() - 5);
  }
  
  return Math.floor(startDate.getTime() / 1000);
}