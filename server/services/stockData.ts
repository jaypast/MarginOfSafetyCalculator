import { 
  getCompanyOverview, 
  getQuote, 
  getIncomeStatement, 
  getBalanceSheet,
  getCashFlow
} from './alphavantage';
import { getYahooFinanceData } from './yahooFinance';
import { StockResponse } from '@shared/schema';

export async function getStockData(symbol: string): Promise<StockResponse> {
  try {
    // Use Yahoo Finance API if available
    if (process.env.RAPIDAPI_KEY) {
      console.log(`Using Yahoo Finance API to fetch data for ${symbol}`);
      return await getYahooFinanceData(symbol);
    }
    
    // Fallback to Alpha Vantage
    console.log(`Using Alpha Vantage API to fetch data for ${symbol}`);
    
    // When using demo API key, we'll use sample data for demonstration
    if (!process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY === 'demo') {
      console.log(`Using sample data for ${symbol}`);
      return getSampleStockData(symbol);
    }
    
    // Fetch all required data in parallel
    const [overview, quote, incomeStatement, balanceSheet, cashFlow] = await Promise.all([
      getCompanyOverview(symbol),
      getQuote(symbol),
      getIncomeStatement(symbol),
      getBalanceSheet(symbol),
      getCashFlow(symbol)
    ]);
    
    // Extract necessary data for calculations
    const latestIncomeStatement = incomeStatement.annualReports[0];
    const previousIncomeStatement = incomeStatement.annualReports[1];
    
    const latestBalanceSheet = balanceSheet.annualReports[0];
    
    const latestCashFlow = cashFlow.annualReports[0];
    
    // Calculate financial metrics
    const netIncome = parseFloat(latestIncomeStatement.netIncome);
    const totalSharesOutstanding = parseFloat(overview.SharesOutstanding);
    const eps = parseFloat(overview.EPS);
    
    const totalEquity = parseFloat(latestBalanceSheet.totalShareholderEquity);
    const roe = (netIncome / totalEquity) * 100;
    
    const totalDebt = parseFloat(latestBalanceSheet.shortLongTermDebtTotal || '0') + 
                     parseFloat(latestBalanceSheet.longTermDebt || '0');
    const debtToEquity = totalDebt / totalEquity;
    
    const currentAssets = parseFloat(latestBalanceSheet.totalCurrentAssets);
    const currentLiabilities = parseFloat(latestBalanceSheet.totalCurrentLiabilities);
    const currentRatio = currentAssets / currentLiabilities;
    
    const freeCashFlow = parseFloat(latestCashFlow.operatingCashflow) - 
                        parseFloat(latestCashFlow.capitalExpenditures);
    const fcfPerShare = freeCashFlow / totalSharesOutstanding;
    
    // Calculate growth rates
    const previousNetIncome = parseFloat(previousIncomeStatement.netIncome);
    const earningsGrowth = ((netIncome - previousNetIncome) / Math.abs(previousNetIncome)) * 100;
    
    // Evaluate earnings stability and competitive position
    // In a real app, this would involve more sophisticated analysis
    const earningsStability = evaluateEarningsStability(incomeStatement.annualReports);
    const competitivePosition = evaluateCompetitivePosition(overview);
    
    // Prepare and return the response
    return {
      symbol: symbol,
      name: overview.Name,
      price: quote.price,
      eps: eps,
      peRatio: quote.price / eps,
      fcfPerShare: fcfPerShare,
      growthRate: parseFloat(overview.PERatio), // Using PE as a proxy for growth in the demo
      roe: roe,
      debtToEquity: debtToEquity,
      currentRatio: currentRatio,
      revenueGrowth: parseFloat(overview.PEGRatio) * 10, // Using PEG as a proxy for revenue growth
      earningsStability: earningsStability,
      competitivePosition: competitivePosition
    };
  } catch (error) {
    console.error('Error aggregating stock data:', error);
    
    // For demo and development, return sample data if real API fails
    // In production, this should throw an error instead
    if (process.env.NODE_ENV !== 'production') {
      console.log(`API error, using sample data for ${symbol}`);
      return getSampleStockData(symbol);
    }
    
    throw error;
  }
}

// Sample data for demonstration purposes
function getSampleStockData(symbol: string): StockResponse {
  return {
    symbol: symbol,
    name: getSampleCompanyName(symbol),
    price: 156.78,
    eps: 6.42,
    peRatio: 24.8,
    fcfPerShare: 6.32,
    growthRate: 11.8,
    roe: 37.5,
    debtToEquity: 0.6,
    currentRatio: 1.7,
    revenueGrowth: 10.5,
    earningsStability: 'High',
    competitivePosition: 'Strong'
  };
}

function getSampleCompanyName(symbol: string): string {
  const companies: Record<string, string> = {
    'AAPL': 'Apple Inc.',
    'MSFT': 'Microsoft Corporation',
    'GOOGL': 'Alphabet Inc.',
    'AMZN': 'Amazon.com, Inc.',
    'META': 'Meta Platforms, Inc.',
    'TSLA': 'Tesla, Inc.',
    'NVDA': 'NVIDIA Corporation',
    'BRK.A': 'Berkshire Hathaway Inc.',
    'BRK.B': 'Berkshire Hathaway Inc.',
    'JPM': 'JPMorgan Chase & Co.',
    'V': 'Visa Inc.',
    'JNJ': 'Johnson & Johnson',
    'WMT': 'Walmart Inc.',
    'PG': 'Procter & Gamble Company',
    'DIS': 'The Walt Disney Company',
    'KO': 'The Coca-Cola Company',
    'BAC': 'Bank of America Corporation',
    'HD': 'The Home Depot, Inc.'
  };
  
  return companies[symbol] || `${symbol} Corporation`;
}

function evaluateEarningsStability(annualReports: any[]): 'High' | 'Medium' | 'Low' {
  // In a real app, this would analyze the consistency of earnings over time
  // For demo, we'll return 'High' stability
  return 'High';
}

function evaluateCompetitivePosition(overview: any): 'Strong' | 'Good' | 'Average' {
  // In a real app, this would analyze market share, barriers to entry, etc.
  // For demo, we'll return 'Strong' position
  return 'Strong';
}
