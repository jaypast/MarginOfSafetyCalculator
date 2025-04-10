import { StockData, ValuationParams, ValuationResult } from './types';

// DCF Analysis calculation
export const calculateDCF = (
  stockData: StockData,
  params: ValuationParams
): number => {
  const { fcfPerShare, eps } = stockData;
  const { dcfGrowthRate, dcfDiscountRate, dcfTerminalMultiple, dcfForecastPeriod } = params;
  
  // Guard against negative or zero FCF which can produce misleading valuations
  if (fcfPerShare <= 0) {
    // Use EPS as a fallback if FCF is negative or zero
    if (eps > 0) {
      // Simplified Graham formula as an alternative
      return eps * (8.5 + 2 * (dcfGrowthRate));
    }
    return -1; // Signal that valuation isn't applicable
  }
  
  let intrinsicValue = 0;
  let currentFCF = fcfPerShare;
  
  // Calculate present value of FCF for forecast period
  for (let year = 1; year <= dcfForecastPeriod; year++) {
    // Grow FCF by growth rate each year
    currentFCF *= (1 + dcfGrowthRate / 100);
    
    // Discount back to present value
    const discountFactor = Math.pow(1 + dcfDiscountRate / 100, year);
    intrinsicValue += currentFCF / discountFactor;
  }
  
  // Calculate terminal value
  const terminalValue = (currentFCF * dcfTerminalMultiple) / 
    Math.pow(1 + dcfDiscountRate / 100, dcfForecastPeriod);
  
  // Add terminal value to intrinsic value
  intrinsicValue += terminalValue;
  
  // Cap extremely high valuations to prevent unrealistic results
  const priceFCFRatio = intrinsicValue / fcfPerShare;
  if (priceFCFRatio > 50) {
    intrinsicValue = fcfPerShare * 50; // Cap at 50x P/FCF multiple
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
      // Cap extremely high P/E ratios that could skew valuations
      if (selectedPE > 50) selectedPE = 50;
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
        // Apply realistic bounds
        if (selectedPE < 10) selectedPE = 10;
        if (selectedPE > 30) selectedPE = 30;
      } else {
        selectedPE = 18.6; // Default to 5-year average
      }
  }
  
  // Adjust EPS if needed
  const adjustedEPS = eps * (peAdjustment / 100);
  
  // Calculate intrinsic value
  const intrinsicValue = adjustedEPS * selectedPE;
  
  return parseFloat(intrinsicValue.toFixed(2));
};

// Graham Formula calculation
export const calculateGraham = (
  stockData: StockData,
  params: ValuationParams
): number => {
  const { eps, growthRate } = stockData;
  const { grahamGrowthRate, grahamBaseValue } = params;
  
  // If EPS is negative, Graham valuation isn't applicable
  if (eps <= 0) {
    return -1; // Return negative value to indicate the valuation is not applicable
  }
  
  // Use either the provided growth rate parameter or the stock's own growth rate,
  // with a preference for the parameter (since it's user-controlled)
  const effectiveGrowthRate = grahamGrowthRate > 0 ? grahamGrowthRate : 
                             (growthRate > 0 ? growthRate : 7); // Default to 7% if no growth data
  
  // Cap growth rate at 20% as per Graham's suggestion
  const cappedGrowthRate = Math.min(effectiveGrowthRate, 20);
  
  // Apply Graham Formula: Intrinsic Value = EPS × (Base + 2g)
  const intrinsicValue = eps * (grahamBaseValue + (2 * cappedGrowthRate));
  
  // Apply a sanity check for exceptionally high valuations
  // Graham typically avoided stocks with P/E ratios over 20
  const impliedPE = intrinsicValue / eps;
  if (impliedPE > 40) {
    return eps * 40; // Cap at 40x P/E as an upper bound for Graham method
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

// Calculate average valuation
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
    currentPrice = validResults[0].buyBelow * (1 + validResults[0].discountPremium / 100);
  } 
  // If that fails, just use the first valid result's intrinsic value as an approximation
  else if (validResults.length > 0) {
    currentPrice = validResults[0].intrinsicValue;
  }
  
  const avgDiscountPremium = calculateDiscountPremium(currentPrice, avgBuyBelow);
  
  return {
    method: 'Average',
    intrinsicValue: avgIntrinsicValue,
    buyBelow: avgBuyBelow,
    discountPremium: avgDiscountPremium
  };
};
