import axios from 'axios';

// Alpha Vantage API key
const API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'demo';

const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

// Basic company overview data
export async function getCompanyOverview(symbol: string) {
  try {
    const response = await axios.get(ALPHA_VANTAGE_BASE_URL, {
      params: {
        function: 'OVERVIEW',
        symbol,
        apikey: API_KEY
      }
    });
    
    if (response.data.Note) {
      throw new Error('API rate limit exceeded. Please try again later.');
    }
    
    if (response.data.Information) {
      throw new Error('Invalid or missing API Key. Please check your Alpha Vantage API key.');
    }
    
    if (!response.data.Symbol) {
      throw new Error(`No data found for symbol: ${symbol}`);
    }
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to fetch company overview: ${error.message}`);
    }
    throw error;
  }
}

// Get current stock price
export async function getQuote(symbol: string) {
  try {
    const response = await axios.get(ALPHA_VANTAGE_BASE_URL, {
      params: {
        function: 'GLOBAL_QUOTE',
        symbol,
        apikey: API_KEY
      }
    });
    
    if (response.data.Note) {
      throw new Error('API rate limit exceeded. Please try again later.');
    }
    
    if (response.data.Information) {
      throw new Error('Invalid or missing API Key. Please check your Alpha Vantage API key.');
    }
    
    const quote = response.data['Global Quote'];
    
    if (!quote || !quote['01. symbol']) {
      throw new Error(`No quote data found for symbol: ${symbol}`);
    }
    
    return {
      symbol: quote['01. symbol'],
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change']),
      changePercent: parseFloat(quote['10. change percent'].replace('%', ''))
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to fetch quote: ${error.message}`);
    }
    throw error;
  }
}

// Get income statement data
export async function getIncomeStatement(symbol: string) {
  try {
    const response = await axios.get(ALPHA_VANTAGE_BASE_URL, {
      params: {
        function: 'INCOME_STATEMENT',
        symbol,
        apikey: API_KEY
      }
    });
    
    if (response.data.Note) {
      throw new Error('API rate limit exceeded. Please try again later.');
    }
    
    if (response.data.Information) {
      throw new Error('Invalid or missing API Key. Please check your Alpha Vantage API key.');
    }
    
    if (!response.data.annualReports || response.data.annualReports.length === 0) {
      throw new Error(`No income statement data found for symbol: ${symbol}`);
    }
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to fetch income statement: ${error.message}`);
    }
    throw error;
  }
}

// Get balance sheet data
export async function getBalanceSheet(symbol: string) {
  try {
    const response = await axios.get(ALPHA_VANTAGE_BASE_URL, {
      params: {
        function: 'BALANCE_SHEET',
        symbol,
        apikey: API_KEY
      }
    });
    
    if (response.data.Note) {
      throw new Error('API rate limit exceeded. Please try again later.');
    }
    
    if (response.data.Information) {
      throw new Error('Invalid or missing API Key. Please check your Alpha Vantage API key.');
    }
    
    if (!response.data.annualReports || response.data.annualReports.length === 0) {
      throw new Error(`No balance sheet data found for symbol: ${symbol}`);
    }
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to fetch balance sheet: ${error.message}`);
    }
    throw error;
  }
}

// Get cash flow data
export async function getCashFlow(symbol: string) {
  try {
    const response = await axios.get(ALPHA_VANTAGE_BASE_URL, {
      params: {
        function: 'CASH_FLOW',
        symbol,
        apikey: API_KEY
      }
    });
    
    if (response.data.Note) {
      throw new Error('API rate limit exceeded. Please try again later.');
    }
    
    if (response.data.Information) {
      throw new Error('Invalid or missing API Key. Please check your Alpha Vantage API key.');
    }
    
    if (!response.data.annualReports || response.data.annualReports.length === 0) {
      throw new Error(`No cash flow data found for symbol: ${symbol}`);
    }
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to fetch cash flow: ${error.message}`);
    }
    throw error;
  }
}
