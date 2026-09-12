import { popularStocks } from './stockSymbols';

// Interface for sentiment analysis results
export interface StockSentiment {
  symbol: string;
  name: string;
  sentimentScore: number; // 0-100, higher is more positive
  mentionCount: number;  // Number of mentions on social media
  priceMovement: number; // Percentage change
  weeklyTrend: 'up' | 'down' | 'stable';
  lastUpdated: string;   // ISO date string of last update
}

// Interface for analyzed stocks with safety calculations
export interface AnalyzedStock {
  symbol: string;
  name: string;
  price: number;
  sentimentScore: number;
  mentionCount: number;
  intrinsicValue: number | null;
  buyBelowPrice: number | null;
  valueGap: number | null;
  quality: 'Exceptional' | 'Good' | 'Average' | 'Caution' | null;
}

// Use top 20 popular stocks as the source pool
const TOP_STOCKS = popularStocks.slice(0, 20);

// Simulated sentiment data - in a real app, this would come from an API
// This function simulates what would happen with a real sentiment analysis API
export function simulateSentimentAnalysis(): StockSentiment[] {
  // Create a date for "last updated" that's a recent Friday (for weekly updates)
  const now = new Date();
  const daysSinceLastFriday = (now.getDay() + 2) % 7; 
  const lastFriday = new Date(now);
  lastFriday.setDate(now.getDate() - daysSinceLastFriday);
  lastFriday.setHours(16, 0, 0, 0); // Set to 4 PM on last Friday
  
  const lastUpdated = lastFriday.toISOString();

  // Select the top 20 stocks and assign simulated sentiment
  return TOP_STOCKS.map(stock => {
    // Generate stable but random-appearing sentiment scores
    // Using the stock symbol as a seed to keep results consistent
    const seed = stock.symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // Generate sentiment between 40-95
    const sentimentScore = 40 + (seed % 56);
    
    // Generate mentions between 1000-50000
    const mentionCount = 1000 + (seed * 31) % 49000;
    
    // Generate price movement between -8% and +8%
    const priceMovement = ((seed * 17) % 1600 - 800) / 100;
    
    // Determine weekly trend
    let weeklyTrend: 'up' | 'down' | 'stable';
    if (priceMovement > 2) {
      weeklyTrend = 'up';
    } else if (priceMovement < -2) {
      weeklyTrend = 'down';
    } else {
      weeklyTrend = 'stable';
    }
    
    return {
      symbol: stock.symbol,
      name: stock.name,
      sentimentScore,
      mentionCount,
      priceMovement,
      weeklyTrend,
      lastUpdated,
    };
  });
}

// Get the top N stocks by sentiment
export function getTopStocksBySentiment(count: number = 10): StockSentiment[] {
  const allSentiments = simulateSentimentAnalysis();
  
  // Sort by sentiment score (high to low)
  return allSentiments
    .sort((a, b) => b.sentimentScore - a.sentimentScore)
    .slice(0, count);
}