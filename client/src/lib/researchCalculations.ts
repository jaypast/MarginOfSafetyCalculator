import { StockData, ValuationParams, ValuationResult } from './types';
import { calculateDCF, calculatePE, calculateGraham, calculateAverageValuation, calculateBuyBelow, calculateDiscountPremium, calculateBuyBelowStatus } from './calculators';

/**
 * Calculate intrinsic value using the exact same methods as the Home page
 * This matches what the user sees in the calculator exactly
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
  
  // Default margin of safety of 25% (matching the default in the calculator)
  const defaultMarginOfSafety = 25;
  
  // Calculate using all three methods - exactly as done in MarginOfSafetyCalculator
  const dcfValue = calculateDCF(stockData, defaultParams);
  const dcfBuyBelow = calculateBuyBelow(dcfValue, defaultMarginOfSafety);
  const dcfDiscountPremium = calculateDiscountPremium(stockData.price, dcfValue);
  const dcfBuyBelowStatus = calculateBuyBelowStatus(stockData.price, dcfBuyBelow);
  
  const peValue = calculatePE(stockData, defaultParams);
  const peBuyBelow = calculateBuyBelow(peValue, defaultMarginOfSafety);
  const peDiscountPremium = calculateDiscountPremium(stockData.price, peValue);
  const peBuyBelowStatus = calculateBuyBelowStatus(stockData.price, peBuyBelow);
  
  const grahamValue = calculateGraham(stockData, defaultParams);
  const grahamBuyBelow = calculateBuyBelow(grahamValue, defaultMarginOfSafety);
  const grahamDiscountPremium = calculateDiscountPremium(stockData.price, grahamValue);
  const grahamBuyBelowStatus = calculateBuyBelowStatus(stockData.price, grahamBuyBelow);
  
  // Create the same ValuationResult[] array used in the calculator
  const results: ValuationResult[] = [
    {
      method: 'DCF Analysis',
      intrinsicValue: dcfValue,
      buyBelow: dcfBuyBelow,
      discountPremium: dcfDiscountPremium,
      buyBelowStatus: dcfBuyBelowStatus
    },
    {
      method: 'P/E Based',
      intrinsicValue: peValue,
      buyBelow: peBuyBelow,
      discountPremium: peDiscountPremium,
      buyBelowStatus: peBuyBelowStatus
    },
    {
      method: 'Graham Formula',
      intrinsicValue: grahamValue,
      buyBelow: grahamBuyBelow,
      discountPremium: grahamDiscountPremium,
      buyBelowStatus: grahamBuyBelowStatus
    }
  ];
  
  // Use the exact same averaging function as the calculator
  const avgResult = calculateAverageValuation(results);
  
  // Return the average intrinsic value, which is what's shown at the top of the calculator
  return avgResult.intrinsicValue;
}

/**
 * Calculate discount percentage based on price and intrinsic value
 * This uses the exact same calculation method as the main calculator
 */
export function calculateDiscount(price: number, intrinsicValue: number): number {
  if (intrinsicValue <= 0 || price <= 0) return 0;
  
  // Use the same discount calculation method as in calculators.ts
  // But we reverse the calculation because in the research page we're showing a discount
  // rather than a premium, which is what calculateDiscountPremium() returns
  const discountPremium = calculateDiscountPremium(price, intrinsicValue);
  const discount = -discountPremium; // Convert premium to discount
  
  return Math.max(0, parseFloat(discount.toFixed(1))); // Only positive discounts
}