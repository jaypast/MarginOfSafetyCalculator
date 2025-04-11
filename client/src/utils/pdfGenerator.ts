import { StockData, ValuationParams, ValuationResult, MarginOfSafetyParams as MoSParams } from '@/lib/types';
import { formatCurrency, formatPercent } from '@/lib/utils';

export const generateCalculationsPDF = (
  stockData: StockData,
  valuationParams: ValuationParams,
  marginOfSafetyParams: MoSParams,
  valuationResults: ValuationResult[]
): string => {
  try {
    // Generate a text report instead of PDF to ensure cross-browser compatibility
    let text = `VALUATION CALCULATION DETAILS: ${stockData.name} (${stockData.symbol})\n`;
    text += `Generated on: ${new Date().toLocaleDateString()}\n\n`;
    
    // Input parameters section
    text += `============ INPUT PARAMETERS ============\n`;
    text += `Current Price: ${formatCurrency(stockData.price)}\n`;
    text += `EPS: ${formatCurrency(stockData.eps)}\n`;
    text += `P/E Ratio: ${stockData.peRatio.toFixed(2)}\n`;
    text += `Free Cash Flow Per Share: ${formatCurrency(stockData.fcfPerShare)}\n`;
    text += `Growth Rate: ${formatPercent(stockData.growthRate)}\n`;
    text += `Return on Equity: ${formatPercent(stockData.roe)}\n`;
    text += `Debt to Equity: ${stockData.debtToEquity.toFixed(2)}\n`;
    text += `Current Ratio: ${stockData.currentRatio.toFixed(2)}\n`;
    text += `Margin of Safety Applied: ${formatPercent(marginOfSafetyParams.marginOfSafety)}\n\n`;
    
    // DCF Calculation Section
    text += `============ DCF ANALYSIS ============\n`;
    text += `Discounted Cash Flow (DCF) analysis estimates intrinsic value based on projected future cash flows.\n\n`;
    
    text += `DCF Parameters:\n`;
    text += `Growth Rate: ${formatPercent(valuationParams.dcfGrowthRate)}\n`;
    text += `Discount Rate: ${formatPercent(valuationParams.dcfDiscountRate)}\n`;
    text += `Terminal Multiple: ${valuationParams.dcfTerminalMultiple}x\n`;
    text += `Forecast Period: ${valuationParams.dcfForecastPeriod} years\n\n`;
    
    text += `DCF Calculation Steps:\n`;
    text += `1. Base Free Cash Flow Per Share: ${formatCurrency(stockData.fcfPerShare)}\n`;
    
    // Calculate projections
    const fcfProjections = calculateDCFProjections(stockData, valuationParams);
    text += `2. Projected Cash Flows:\n`;
    fcfProjections.forEach((fcf, index) => {
      const year = new Date().getFullYear() + index;
      text += `   Year ${index + 1} (${year}): ${formatCurrency(fcf)}\n`;
    });
    
    // Calculate terminal value
    const terminalValue = fcfProjections[fcfProjections.length - 1] * valuationParams.dcfTerminalMultiple;
    text += `3. Terminal Value: ${formatCurrency(terminalValue)}\n`;
    
    // Calculate discount factors
    text += `4. Discount Factors Applied:\n`;
    const discountFactors = fcfProjections.map((_, index) => {
      return 1 / Math.pow(1 + (valuationParams.dcfDiscountRate / 100), index + 1);
    });
    
    discountFactors.forEach((factor, index) => {
      text += `   Year ${index + 1}: ${factor.toFixed(4)}\n`;
    });
    
    // Terminal value discount
    const terminalValueDiscount = 1 / Math.pow(1 + (valuationParams.dcfDiscountRate / 100), valuationParams.dcfForecastPeriod);
    text += `   Terminal Value Discount: ${terminalValueDiscount.toFixed(4)}\n`;
    
    // Calculate discounted values
    const discountedCashFlows = fcfProjections.map((fcf, index) => fcf * discountFactors[index]);
    const discountedTerminalValue = terminalValue * terminalValueDiscount;
    
    text += `5. Discounted Cash Flows:\n`;
    discountedCashFlows.forEach((dcf, index) => {
      text += `   Year ${index + 1}: ${formatCurrency(dcf)}\n`;
    });
    text += `   Discounted Terminal Value: ${formatCurrency(discountedTerminalValue)}\n`;
    
    // Calculate intrinsic value
    const intrinsicValue = discountedCashFlows.reduce((acc, val) => acc + val, 0) + discountedTerminalValue;
    text += `6. Sum of Discounted Values: ${formatCurrency(intrinsicValue)}\n\n`;
    
    const dcfResult = valuationResults.find(r => r.method.includes('DCF'));
    text += `DCF Intrinsic Value: ${formatCurrency(dcfResult?.intrinsicValue || intrinsicValue)}\n`;
    text += `Buy Below Price (with MoS): ${formatCurrency(dcfResult?.buyBelow || (intrinsicValue * (1 - marginOfSafetyParams.marginOfSafety/100)))}\n\n`;
    
    // P/E Section
    text += `============ P/E MULTIPLE VALUATION ============\n`;
    text += `The P/E valuation method multiplies earnings per share by an appropriate P/E multiple.\n\n`;
    
    text += `P/E Parameters:\n`;
    text += `P/E Type: ${valuationParams.peType}\n`;
    if (valuationParams.peType === 'custom') {
      text += `Custom P/E Value: ${valuationParams.peCustomValue}\n`;
    }
    text += `P/E Adjustment: ${valuationParams.peAdjustment}%\n\n`;
    
    // P/E Calculation steps
    let peValue = 0;
    let adjustedPE = 0;
    switch (valuationParams.peType) {
      case 'current':
        adjustedPE = stockData.peRatio * (valuationParams.peAdjustment / 100);
        peValue = stockData.eps * adjustedPE;
        break;
      case 'custom':
        adjustedPE = valuationParams.peCustomValue * (valuationParams.peAdjustment / 100);
        peValue = stockData.eps * adjustedPE;
        break;
      default:
        // For 5year, 10year, industry - using the calculated result
        const peResult = valuationResults.find(r => r.method.includes('P/E'));
        peValue = peResult?.intrinsicValue || 0;
        adjustedPE = peValue / stockData.eps;
        break;
    }
    
    text += `P/E Calculation Steps:\n`;
    text += `1. Earnings Per Share (EPS): ${formatCurrency(stockData.eps)}\n`;
    text += `2. Selected P/E Multiple: ${valuationParams.peType === 'custom' ? valuationParams.peCustomValue.toFixed(2) : stockData.peRatio.toFixed(2)}\n`;
    text += `3. Adjusted P/E Multiple (with ${valuationParams.peAdjustment}% adjustment): ${adjustedPE.toFixed(2)}\n`;
    text += `4. Intrinsic Value Calculation: ${formatCurrency(stockData.eps)} × ${adjustedPE.toFixed(2)} = ${formatCurrency(peValue)}\n\n`;
    
    const peResult = valuationResults.find(r => r.method.includes('P/E'));
    text += `P/E Based Intrinsic Value: ${formatCurrency(peResult?.intrinsicValue || peValue)}\n`;
    text += `Buy Below Price (with MoS): ${formatCurrency(peResult?.buyBelow || (peValue * (1 - marginOfSafetyParams.marginOfSafety/100)))}\n\n`;
    
    // Graham Section
    text += `============ GRAHAM FORMULA VALUATION ============\n`;
    text += `The Graham Formula estimates intrinsic value using Benjamin Graham's formula: V = EPS × (8.5 + 2g)\n\n`;
    
    text += `Graham Parameters:\n`;
    text += `Base Value: ${valuationParams.grahamBaseValue}\n`;
    text += `Growth Rate: ${formatPercent(valuationParams.grahamGrowthRate)}\n\n`;
    
    // Graham Calculation steps
    const grahamFormula = valuationParams.grahamBaseValue + (2 * valuationParams.grahamGrowthRate);
    const grahamValue = stockData.eps * grahamFormula;
    
    text += `Graham Calculation Steps:\n`;
    text += `1. Earnings Per Share (EPS): ${formatCurrency(stockData.eps)}\n`;
    text += `2. Graham Formula: ${valuationParams.grahamBaseValue} + (2 × ${valuationParams.grahamGrowthRate}%) = ${grahamFormula.toFixed(2)}\n`;
    text += `3. Intrinsic Value Calculation: ${formatCurrency(stockData.eps)} × ${grahamFormula.toFixed(2)} = ${formatCurrency(grahamValue)}\n\n`;
    
    const grahamResult = valuationResults.find(r => r.method.includes('Graham'));
    text += `Graham Formula Intrinsic Value: ${formatCurrency(grahamResult?.intrinsicValue || grahamValue)}\n`;
    text += `Buy Below Price (with MoS): ${formatCurrency(grahamResult?.buyBelow || (grahamValue * (1 - marginOfSafetyParams.marginOfSafety/100)))}\n\n`;
    
    // Summary Section  
    text += `============ VALUATION SUMMARY ============\n`;
    text += `Method          Intrinsic Value    Buy Below    Discount/Premium\n`;
    text += `--------------------------------------------------------------\n`;
    
    valuationResults.forEach(result => {
      // Format each column to a specific width
      const method = result.method.padEnd(15);
      const intrinsicValue = formatCurrency(result.intrinsicValue).padEnd(18);
      const buyBelow = formatCurrency(result.buyBelow).padEnd(12);
      const premium = `${result.discountPremium > 0 ? '+' : ''}${result.discountPremium.toFixed(1)}%`;
      
      text += `${method}${intrinsicValue}${buyBelow}${premium}\n`;
    });
    text += `\n`;
    
    // Conclusion
    const avgResult = valuationResults.find(r => r.method === 'Average');
    if (avgResult) {
      text += `============ CONCLUSION ============\n`;
      text += `Based on an average of all valuation methods, ${stockData.name} (${stockData.symbol}) `;
      
      if (avgResult.discountPremium < 0) {
        text += `appears to be trading at a ${Math.abs(avgResult.discountPremium).toFixed(1)}% discount to its calculated `;
        text += `intrinsic value of ${formatCurrency(avgResult.intrinsicValue)}.\n\n`;
        
        if (avgResult.discountPremium < -25) {
          text += `This represents a substantial margin of safety.\n`;
        } else if (avgResult.discountPremium < -10) {
          text += `This represents a reasonable margin of safety.\n`;
        } else {
          text += `This represents a modest discount to intrinsic value.\n`;
        }
      } else {
        text += `appears to be trading at a ${avgResult.discountPremium.toFixed(1)}% premium to its calculated `;
        text += `intrinsic value of ${formatCurrency(avgResult.intrinsicValue)}.\n\n`;
        text += `This does not provide an adequate margin of safety.\n`;
      }
    }
    
    // Add disclaimer
    text += `\nDISCLAIMER: This report is generated for educational purposes only and should not be considered investment advice.\n`;
    text += `All calculations are based on available data and assumptions. Always conduct your own research and consider\n`;
    text += `consulting with a financial advisor before making investment decisions.\n`;
    
    console.log(`Text report successfully generated for ${stockData.symbol}`);
    return text;
  } catch (error) {
    console.error("Error generating report:", error);
    return `Error generating report: ${error}`;
  }
};

// Helper function to calculate DCF projections
function calculateDCFProjections(stockData: StockData, params: ValuationParams): number[] {
  const projections = [];
  let fcf = stockData.fcfPerShare;
  
  for (let i = 0; i < params.dcfForecastPeriod; i++) {
    fcf *= (1 + (params.dcfGrowthRate / 100));
    projections.push(fcf);
  }
  
  return projections;
}
