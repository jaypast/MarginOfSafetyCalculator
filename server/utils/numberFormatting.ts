/**
 * Utility functions for consistent number formatting throughout the application
 */

/**
 * Rounds a number to a specific number of decimal places
 * @param num The number to round
 * @param decimals The number of decimal places (default: 2)
 * @returns The rounded number
 */
export function roundToDecimal(num: number, decimals: number = 2): number {
  if (isNaN(num)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Formats financial data for consistent decimal precision
 * @param data The stock data object to format
 * @returns The formatted stock data object
 */
export function formatStockData(data: Record<string, any>): Record<string, any> {
  // Clone the data to avoid modifying the original
  const formatted = { ...data };
  
  // Properties that should be rounded to 2 decimal places
  const twoDecimalProps = [
    'price', 
    'eps', 
    'peRatio', 
    'fcfPerShare', 
    'growthRate', 
    'roe', 
    'debtToEquity', 
    'currentRatio', 
    'revenueGrowth'
  ];
  
  // Apply rounding to numeric properties
  for (const prop of twoDecimalProps) {
    if (prop in formatted && typeof formatted[prop] === 'number') {
      formatted[prop] = roundToDecimal(formatted[prop], 2);
    }
  }
  
  return formatted;
}