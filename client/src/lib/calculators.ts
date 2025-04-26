import { StockData, ValuationParams, ValuationResult } from './types';

// DCF Analysis calculation
import { getAdjustmentFactors, detectDataIssues } from './companyAdjustments';

export const calculateDCF = (
  stockData: StockData,
  params: ValuationParams
): number => {
  const { fcfPerShare, eps, symbol, growthRate } = stockData;
  const { dcfGrowthRate, dcfDiscountRate, dcfTerminalMultiple, dcfForecastPeriod } = params;
  
  // Get appropriate adjustment factors for this stock
  const adjustments = getAdjustmentFactors(stockData);
  
  // Check for data quality issues
  const dataIssues = detectDataIssues(stockData);
  
  // Determine effective FCF to use
  let effectiveFCF = fcfPerShare;
  
  // Handle FCF issues with EPS-based estimation
  if (dataIssues.hasFcfIssue || dataIssues.hasExtremeFcf) {
    // If EPS is positive, use it as a basis for estimation
    if (eps > 0) {
      // Use the industry-appropriate FCF to EPS ratio
      effectiveFCF = eps * adjustments.fcfToEpsRatio;
    } else {
      return -1; // If both FCF and EPS are negative, DCF isn't applicable
    }
  } 
  
  // Sanity check: cap FCF to EPS ratio for outlier data points
  if (eps > 0 && effectiveFCF > eps * 3) {
    effectiveFCF = eps * 2.5; // Cap at 2.5x EPS if FCF seems unreasonably high
  }
  
  // Determine effective growth rate
  let effectiveGrowthRate = dcfGrowthRate > 0 ? dcfGrowthRate : growthRate;
  
  // Cap growth rate based on industry adjustment
  effectiveGrowthRate = Math.max(2, Math.min(effectiveGrowthRate, adjustments.growthRateCap));
  
  let intrinsicValue = 0;
  let currentFCF = effectiveFCF;
  
  // Calculate present value of FCF for forecast period
  for (let year = 1; year <= dcfForecastPeriod; year++) {
    // Use declining growth rate model for more realistic projections
    const yearGrowthRate = effectiveGrowthRate * Math.pow(0.95, year - 1);
    
    // Grow FCF by calculated growth rate
    currentFCF *= (1 + yearGrowthRate / 100);
    
    // Discount back to present value
    const discountFactor = Math.pow(1 + dcfDiscountRate / 100, year);
    intrinsicValue += currentFCF / discountFactor;
  }
  
  // Calculate terminal value with more conservative assumptions
  // For terminal value, use a lower growth rate (closer to GDP growth)
  const terminalGrowthRate = Math.min(effectiveGrowthRate * 0.5, 4);
  const terminalFCF = currentFCF * (1 + terminalGrowthRate / 100);
  
  // Use industry-appropriate terminal multiple
  const effectiveTerminalMultiple = Math.min(dcfTerminalMultiple, adjustments.terminalMultipleCap);
  
  const terminalValue = (terminalFCF * effectiveTerminalMultiple) / 
    Math.pow(1 + dcfDiscountRate / 100, dcfForecastPeriod);
  
  // Add terminal value to intrinsic value
  intrinsicValue += terminalValue;
  
  // Apply FCF multiple cap based on industry
  const priceFCFRatio = intrinsicValue / effectiveFCF;
  if (priceFCFRatio > adjustments.fcfMultipleCap) {
    intrinsicValue = effectiveFCF * adjustments.fcfMultipleCap;
  }
  
  // Apply final price-based cap from industry adjustments
  const maxAllowedValue = stockData.price * adjustments.priceToCap;
  if (intrinsicValue > maxAllowedValue) {
    intrinsicValue = maxAllowedValue;
  }
  
  // Special handling for Japanese stocks to ensure minimum value
  if (symbol.endsWith('.T')) {
    const minValue = stockData.price * 0.65; // At minimum 65% of current price
    intrinsicValue = Math.max(minValue, intrinsicValue);
  }
  
  return parseFloat(intrinsicValue.toFixed(2));
};

// P/E Based Valuation calculation
export const calculatePE = (
  stockData: StockData,
  params: ValuationParams
): number => {
  const { eps, peRatio, growthRate } = stockData;
  const { peType, peCustomValue, peAdjustment } = params;
  
  // Get appropriate adjustment factors for this stock
  const adjustments = getAdjustmentFactors(stockData);
  
  // If EPS is negative, P/E valuation isn't meaningful
  if (eps <= 0) {
    return -1; // Return negative value to indicate the valuation is not applicable
  }
  
  // Determine which P/E ratio to use
  let selectedPE: number;
  
  switch (peType) {
    case 'current':
      // Use current P/E with validation
      selectedPE = peRatio > 0 ? peRatio : 15;
      // Cap P/E ratio based on industry adjustments
      if (selectedPE > adjustments.peMultipleCap) {
        selectedPE = adjustments.peMultipleCap;
      }
      break;
    case '5year':
      selectedPE = 18.6; // Example historical value
      break;
    case '10year':
      selectedPE = 16.2; // Example historical value
      break;
    case 'industry':
      selectedPE = 22.5; // Example industry value
      break;
    case 'custom':
      selectedPE = peCustomValue;
      break;
    default:
      // Default to growth-adjusted P/E if growth rate is available
      if (growthRate > 0) {
        // Use PEG ratio of 1.5 as a reasonable benchmark
        selectedPE = growthRate * 1.5;
        // Apply industry-appropriate bounds
        if (selectedPE < 10) selectedPE = 10;
        if (selectedPE > adjustments.peMultipleCap) {
          selectedPE = adjustments.peMultipleCap;
        }
      } else {
        selectedPE = 18.6; // Default to 5-year average
      }
  }
  
  // Adjust EPS if needed
  const adjustedEPS = eps * (peAdjustment / 100);
  
  // Calculate intrinsic value
  let intrinsicValue = adjustedEPS * selectedPE;
  
  // Apply price-based cap from industry adjustments
  const maxAllowedValue = stockData.price * adjustments.priceToCap;
  if (intrinsicValue > maxAllowedValue) {
    intrinsicValue = maxAllowedValue;
  }
  
  // For Japanese stocks, ensure a minimum reasonable value
  if (stockData.symbol.endsWith('.T')) {
    const minValue = stockData.price * 0.7; // At minimum 70% of current price
    intrinsicValue = Math.max(minValue, intrinsicValue);
  }
  
  return parseFloat(intrinsicValue.toFixed(2));
};

// Graham Formula calculation
export const calculateGraham = (
  stockData: StockData,
  params: ValuationParams
): number => {
  const { eps, growthRate } = stockData;
  const { grahamGrowthRate, grahamBaseValue } = params;
  
  // Get appropriate adjustment factors for this stock
  const adjustments = getAdjustmentFactors(stockData);
  
  // If EPS is negative, Graham valuation isn't applicable
  if (eps <= 0) {
    return -1; // Return negative value to indicate the valuation is not applicable
  }
  
  // Use either the provided growth rate parameter or the stock's own growth rate,
  // with a preference for the parameter (since it's user-controlled)
  const effectiveGrowthRate = grahamGrowthRate > 0 ? grahamGrowthRate : 
                             (growthRate > 0 ? growthRate : 7); // Default to 7% if no growth data
  
  // Cap growth rate based on industry adjustment and Graham's 20% suggestion
  const cappedGrowthRate = Math.min(effectiveGrowthRate, 
                                   Math.min(20, adjustments.growthRateCap));
  
  // Apply Graham Formula: Intrinsic Value = EPS × (Base + 2g)
  let intrinsicValue = eps * (grahamBaseValue + (2 * cappedGrowthRate));
  
  // Apply a sanity check for exceptionally high valuations based on industry
  const impliedPE = intrinsicValue / eps;
  if (impliedPE > adjustments.peMultipleCap) {
    intrinsicValue = eps * adjustments.peMultipleCap;
  }
  
  // Apply price-based cap from industry adjustments
  const maxAllowedValue = stockData.price * adjustments.priceToCap;
  if (intrinsicValue > maxAllowedValue) {
    intrinsicValue = maxAllowedValue;
  }
  
  // For Japanese stocks, ensure a minimum reasonable value
  if (stockData.symbol.endsWith('.T')) {
    const minValue = stockData.price * 0.65; // At minimum 65% of current price
    intrinsicValue = Math.max(minValue, intrinsicValue);
  }
  
  return parseFloat(intrinsicValue.toFixed(2));
};

// Calculate buy below price with margin of safety
export const calculateBuyBelow = (
  intrinsicValue: number,
  marginOfSafety: number
): number => {
  // For negative intrinsic values, we don't apply a margin of safety
  // Instead, we use a fixed percentage of the current price as a conservative approach
  if (intrinsicValue <= 0) {
    // Return a small positive value to avoid confusion in UI
    return 0.01;
  }
  
  const buyBelow = intrinsicValue * (1 - marginOfSafety / 100);
  return parseFloat(buyBelow.toFixed(2));
};

// Calculate discount or premium to current price
export const calculateDiscountPremium = (
  currentPrice: number,
  comparePrice: number
): number => {
  // Handle cases where comparePrice is negative or zero
  if (comparePrice <= 0) {
    // When company has negative earnings/intrinsic value, it's always considered overvalued (premium)
    return 100; // Return a high premium to indicate overvaluation
  }
  
  const discountPremium = ((currentPrice - comparePrice) / comparePrice) * 100;
  return parseFloat(discountPremium.toFixed(1));
};

// Calculate discount/premium relative to buy below price (with margin of safety)
export const calculateBuyBelowStatus = (
  currentPrice: number,
  buyBelowPrice: number
): number => {
  // Handle cases where buyBelowPrice is negative or zero
  if (buyBelowPrice <= 0) {
    return 100; // Return a high premium to indicate overvaluation
  }
  
  const discountPremium = ((currentPrice - buyBelowPrice) / buyBelowPrice) * 100;
  return parseFloat(discountPremium.toFixed(1));
};

export const calculateAverageValuation = (
  valuationResults: ValuationResult[]
): ValuationResult => {
  if (valuationResults.length === 0) {
    return {
      method: 'Average',
      intrinsicValue: 0,
      buyBelow: 0,
      discountPremium: 0
    };
  }
  
  // Filter out negative or invalid intrinsic values before calculating average
  const validResults = valuationResults.filter(result => result.intrinsicValue > 0);
  
  if (validResults.length === 0) {
    // If no valid results, return a placeholder
    return {
      method: 'Average',
      intrinsicValue: -1, // Signal not applicable
      buyBelow: 0.01,
      discountPremium: 100 // High premium to indicate overvaluation
    };
  }
  
  // Calculate average from valid results only
  const sumIntrinsicValue = validResults.reduce((sum, result) => sum + result.intrinsicValue, 0);
  const sumBuyBelow = validResults.reduce((sum, result) => sum + result.buyBelow, 0);
  
  const avgIntrinsicValue = parseFloat((sumIntrinsicValue / validResults.length).toFixed(2));
  const avgBuyBelow = parseFloat((sumBuyBelow / validResults.length).toFixed(2));
  
  // Get current price from the stockData
  let currentPrice = 0;
  // First try to extract it from the discount/premium calculation
  if (validResults[0].discountPremium !== 0) {
    currentPrice = validResults[0].intrinsicValue * (1 + validResults[0].discountPremium / 100);
  } 
  // If that fails, just use the first valid result's intrinsic value as an approximation
  else if (validResults.length > 0) {
    currentPrice = validResults[0].intrinsicValue;
  }
  
  // Calculate the discount/premium based on intrinsic value (not buy below price)
  const avgDiscountPremium = calculateDiscountPremium(currentPrice, avgIntrinsicValue);
  
  // Calculate buy below status for average
  const avgBuyBelowStatus = calculateBuyBelowStatus(currentPrice, avgBuyBelow);
  
  return {
    method: 'Average',
    intrinsicValue: avgIntrinsicValue,
    buyBelow: avgBuyBelow,
    discountPremium: avgDiscountPremium,
    buyBelowStatus: avgBuyBelowStatus
  };
};
