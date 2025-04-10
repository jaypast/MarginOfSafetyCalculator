import { exec } from 'child_process';
import { promisify } from 'util';
import { StockResponse } from '../../shared/schema';

// Promisify the exec function to use with async/await
const execAsync = promisify(exec);

// Function to get stock data from Yahoo Finance using the Python yfinance package
export async function getYahooFinanceData(symbol: string): Promise<StockResponse> {
  try {
    console.log(`Fetching Yahoo Finance data for ${symbol} using yfinance`);
    
    // Call the Python script with the stock symbol as an argument
    const { stdout, stderr } = await execAsync(`python3 server/services/yfinance_service.py ${symbol}`);
    
    if (stderr) {
      console.error(`Python script error: ${stderr}`);
    }
    
    // Parse the JSON response from the Python script
    const data = JSON.parse(stdout);
    
    // Check if there was an error from the Python script
    if (data.error) {
      console.error(`Error from Python script: ${data.error}`);
      throw new Error(data.message || `Failed to fetch data for ${symbol}`);
    }
    
    console.log(`Successfully received data for ${symbol}`);
    
    // Return the stock data directly
    return data as StockResponse;
    
  } catch (error) {
    console.error('Error fetching Yahoo Finance data:', error);
    throw new Error(`Failed to fetch data for ${symbol}`);
  }
}