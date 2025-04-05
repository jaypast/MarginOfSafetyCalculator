import { StockData, ValuationParams, ValuationResult } from './types';

// DCF Analysis calculation
export const calculateDCF = (
  stockData: StockData,
  params: ValuationParams
): number => {
  const { fcfPerShare } = stockData;
  const { dcfGrowthRate, dcfDiscountRate, dcfTerminalMultiple, dcfForecastPeriod } = params;
  
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
  
  return parseFloat(intrinsicValue.toFixed(2));
};

// P/E Based Valuation calculation
export const calculatePE = (
  stockData: StockData,
  params: ValuationParams
): number => {
  const { eps, peRatio } = stockData;
  const { peType, peCustomValue, peAdjustment } = params;
  
  // Determine which P/E ratio to use
  let selectedPE: number;
  
  switch (peType) {
    case 'current':
      selectedPE = peRatio;
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
      selectedPE = 18.6; // Default to 5-year average
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
  const { eps } = stockData;
  const { grahamGrowthRate, grahamBaseValue } = params;
  
  // Cap growth rate at 20% as per Graham's suggestion
  const cappedGrowthRate = Math.min(grahamGrowthRate, 20);
  
  // Apply Graham Formula: Intrinsic Value = EPS × (Base + 2g)
  const intrinsicValue = eps * (grahamBaseValue + (2 * cappedGrowthRate));
  
  return parseFloat(intrinsicValue.toFixed(2));
};

// Calculate buy below price with margin of safety
export const calculateBuyBelow = (
  intrinsicValue: number,
  marginOfSafety: number
): number => {
  const buyBelow = intrinsicValue * (1 - marginOfSafety / 100);
  return parseFloat(buyBelow.toFixed(2));
};

// Calculate discount or premium to current price
export const calculateDiscountPremium = (
  currentPrice: number,
  comparePrice: number
): number => {
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
  
  const sumIntrinsicValue = valuationResults.reduce((sum, result) => sum + result.intrinsicValue, 0);
  const sumBuyBelow = valuationResults.reduce((sum, result) => sum + result.buyBelow, 0);
  
  const avgIntrinsicValue = parseFloat((sumIntrinsicValue / valuationResults.length).toFixed(2));
  const avgBuyBelow = parseFloat((sumBuyBelow / valuationResults.length).toFixed(2));
  
  // Calculate average discount/premium using the average buy below price
  const currentPrice = valuationResults[0].intrinsicValue * (1 + valuationResults[0].discountPremium / 100);
  const avgDiscountPremium = calculateDiscountPremium(currentPrice, avgBuyBelow);
  
  return {
    method: 'Average',
    intrinsicValue: avgIntrinsicValue,
    buyBelow: avgBuyBelow,
    discountPremium: avgDiscountPremium
  };
};
