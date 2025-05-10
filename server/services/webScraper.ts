import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { StockResponse } from '@shared/schema';
import { HistoricalDataResponse } from './yahooFinance';

/**
 * Web scraper to extract stock data directly from Yahoo Finance website
 * This bypasses API rate limits by scraping the data directly from the website
 */
export async function scrapeStockData(symbol: string): Promise<StockResponse> {
  console.log(`Scraping Yahoo Finance website for ${symbol}`);
  
  try {
    // Fetch the summary page for the stock symbol
    const response = await fetch(`https://finance.yahoo.com/quote/${symbol}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
        'Accept': 'text/html'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch page for ${symbol}, status: ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extract the stock name and price
    const companyName = $('h1').text().trim();
    const price = parseFloat($('[data-test="qsp-price"]').text().replace(/,/g, '')) || 0;
    
    // Get statistics page for more detailed metrics
    const statsResponse = await fetch(`https://finance.yahoo.com/quote/${symbol}/key-statistics`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
        'Accept': 'text/html'
      }
    });
    
    if (!statsResponse.ok) {
      throw new Error(`Failed to fetch statistics page for ${symbol}`);
    }
    
    const statsHtml = await statsResponse.text();
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
    
    // Parse the metrics we need
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
    
    const stockData: StockResponse = {
      symbol,
      name: companyName || symbol,
      price,
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
    
    console.log(`Successfully scraped data for ${symbol}`);
    return stockData;
    
  } catch (error: any) {
    console.error('Error scraping Yahoo Finance:', error.message);
    throw new Error(`Failed to scrape data for ${symbol}`);
  }
}

/**
 * Parse historical data from Yahoo Finance
 * This retrieves price history directly from the website
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
    
    // Fetch the historical data page
    const url = `https://finance.yahoo.com/quote/${symbol}/history?period1=${getStartTimestamp(period)}&period2=${Math.floor(Date.now() / 1000)}&interval=${yahooInterval}&filter=history`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
        'Accept': 'text/html'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch historical data page for ${symbol}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extract the historical data table
    const historicalData: HistoricalDataResponse['data'] = [];
    
    // Find the table rows
    $('table[data-test="historical-prices"] tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 6) {
        const dateText = $(cells[0]).text().trim();
        if (!dateText || dateText === 'Dividend') return; // Skip dividend rows
        
        const date = new Date(dateText);
        if (isNaN(date.getTime())) return; // Skip invalid dates
        
        const openText = $(cells[1]).text().trim();
        const highText = $(cells[2]).text().trim();
        const lowText = $(cells[3]).text().trim();
        const closeText = $(cells[4]).text().trim();
        const volumeText = $(cells[6]).text().trim();
        
        historicalData.push({
          date: date.toISOString().split('T')[0],
          open: parseNumber(openText),
          high: parseNumber(highText),
          low: parseNumber(lowText),
          close: parseNumber(closeText),
          volume: parseInt(volumeText.replace(/,/g, '')) || 0
        });
      }
    });
    
    // Sort data chronologically
    historicalData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    console.log(`Successfully scraped historical data for ${symbol}`);
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