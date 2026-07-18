import { StockData, ValuationParams, ValuationResult } from './types';
import { calculateDCF, calculatePE, calculateGraham, calculateAverageValuation, calculateBuyBelow, calculateDiscountPremium, calculateBuyBelowStatus } from './calculators';

export type StockQuality = 'Exceptional' | 'Good' | 'Average' | 'Speculative';

/**
 * Shared quality scorer used by both the Research page and TopResearch component.
 * Grades are based on return on equity, debt load, and liquidity.
 *   Exceptional — ROE > 20%, D/E < 0.5, current ratio > 1.5
 *   Good        — ROE > 15%, D/E < 1,   current ratio > 1.2
 *   Speculative — ROE < 10%  OR  D/E > 2  OR  current ratio < 1
 *   Average     — everything else
 */
export function computeStockQuality(stockData: {
  roe?: number | null;
  debtToEquity?: number | null;
  currentRatio?: number | null;
}): StockQuality {
  const roe = stockData.roe ?? 0;
  const dte = stockData.debtToEquity ?? 0;
  const cr  = stockData.currentRatio ?? 0;

  if (roe > 20 && dte < 0.5 && cr > 1.5) return 'Exceptional';
  if (roe > 15 && dte < 1   && cr > 1.2) return 'Good';
  if (roe < 10 || dte > 2   || cr < 1)   return 'Speculative';
  return 'Average';
}

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
  
  // Create filtered results array with only valid valuations (positive values)
  // This is the key fix - we must exclude any 0 values as well, not just negative ones
  const validValues = [];
  if (dcfValue > 0) validValues.push({
    method: 'DCF Analysis',
    intrinsicValue: dcfValue,
    buyBelow: dcfBuyBelow,
    discountPremium: dcfDiscountPremium,
    buyBelowStatus: dcfBuyBelowStatus
  });
  
  if (peValue > 0) validValues.push({
    method: 'P/E Based',
    intrinsicValue: peValue,
    buyBelow: peBuyBelow,
    discountPremium: peDiscountPremium,
    buyBelowStatus: peBuyBelowStatus
  });
  
  if (grahamValue > 0) validValues.push({
    method: 'Graham Formula',
    intrinsicValue: grahamValue,
    buyBelow: grahamBuyBelow,
    discountPremium: grahamDiscountPremium,
    buyBelowStatus: grahamBuyBelowStatus
  });
  
  // Manual calculation for debugging
  let manualAverage = 0;
  if (validValues.length > 0) {
    const sum = validValues.reduce((total, val) => total + val.intrinsicValue, 0);
    manualAverage = sum / validValues.length;
  }
  
  // Use the exact same averaging function as the calculator. Pass the actual
  // current price so the average's discount/premium is based on real data
  // rather than reverse-engineered from a capped discountPremium.
  const avgResult = calculateAverageValuation(validValues, stockData.price);
  
  // Add debugging for GOOGL
  if (stockData.symbol === 'GOOGL') {
    console.log('GOOGL Calculation Details Fixed:', {
      symbol: stockData.symbol,
      dcfValue,
      peValue,
      grahamValue,
      validMethods: validValues.length,
      manualAverage: manualAverage.toFixed(2),
      avgValue: avgResult.intrinsicValue
    });
  }
  
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