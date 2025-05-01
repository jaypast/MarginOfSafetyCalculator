import { StockData, ValuationParams } from './types';
import { calculateDCF, calculatePE, calculateGraham, calculateAverageValuation } from './calculators';

/**
 * Calculate intrinsic value using the same methods as the Home page's calculator
 * to ensure consistency between Research and Home valuation results
 */
export function calculateIntrinsicValue(stockData: StockData): number {
  // Default parameters used in the MarginOfSafetyCalculator
  const defaultParams: ValuationParams = {
    // DCF Parameters
    dcfGrowthRate: stockData.growthRate,
    dcfDiscountRate: 10,
    dcfTerminalMultiple: 15,
    dcfForecastPeriod: 10,
    
    // P/E Parameters
    peType: 'current',
    peCustomValue: 15,
    peAdjustment: 0,
    
    // Graham Parameters
    grahamGrowthRate: stockData.growthRate,
    grahamBaseValue: 15
  };
  
  // Calculate using all three methods
  const dcfValue = calculateDCF(stockData, defaultParams);
  const peValue = calculatePE(stockData, defaultParams);
  const grahamValue = calculateGraham(stockData, defaultParams);
  
  // Calculate average of all valid valuations (same as home page)
  const valuations = [];
  if (dcfValue > 0) valuations.push(dcfValue);
  if (peValue > 0) valuations.push(peValue);
  if (grahamValue > 0) valuations.push(grahamValue);
  
  if (valuations.length === 0) {
    // If no valid valuations, use a conservative estimate based on price
    return stockData.price * 0.9;
  }
  
  // Calculate average
  const sum = valuations.reduce((total, val) => total + val, 0);
  return parseFloat((sum / valuations.length).toFixed(2));
}

/**
 * Calculate discount percentage based on price and intrinsic value
 */
export function calculateDiscount(price: number, intrinsicValue: number): number {
  if (intrinsicValue <= 0 || price <= 0) return 0;
  const discount = ((intrinsicValue - price) / intrinsicValue) * 100;
  return Math.max(0, parseFloat(discount.toFixed(1))); // Only positive discounts, max 1 decimal place
}