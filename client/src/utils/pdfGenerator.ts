// We're using a simple approach with jsPDF for PDF generation
// This can be further enhanced with more styling and formatting

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { StockData, ValuationParams, ValuationResult, MarginOfSafetyParams as MoSParams } from '@/lib/types';
import { formatCurrency, formatPercent } from '@/lib/utils';

// This extends the jsPDF type to include autotable functionality 
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF & {
      lastAutoTable: {
        finalY: number;
      };
    };
  }
}

export const generateCalculationsPDF = (
  stockData: StockData,
  valuationParams: ValuationParams,
  marginOfSafetyParams: MoSParams,
  valuationResults: ValuationResult[]
): void => {
  // Initialize PDF document
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Add header
  doc.setFontSize(20);
  doc.setTextColor(26, 32, 44); // dark blue color
  doc.text(`Valuation Calculation Details: ${stockData.name} (${stockData.symbol})`, 14, 20);
  
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  const date = new Date().toLocaleDateString();
  doc.text(`Generated on: ${date}`, 14, 30);
  
  // Input parameters section
  doc.setFontSize(16);
  doc.setTextColor(26, 32, 44);
  doc.text("Input Parameters", 14, 40);
  
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text(`Current Price: ${formatCurrency(stockData.price)}`, 14, 48);
  doc.text(`EPS: ${formatCurrency(stockData.eps)}`, 14, 54);
  doc.text(`P/E Ratio: ${stockData.peRatio.toFixed(2)}`, 14, 60);
  doc.text(`Free Cash Flow Per Share: ${formatCurrency(stockData.fcfPerShare)}`, 14, 66);
  doc.text(`Growth Rate: ${formatPercent(stockData.growthRate)}`, 14, 72);
  doc.text(`Return on Equity: ${formatPercent(stockData.roe)}`, 14, 78);
  doc.text(`Debt to Equity: ${stockData.debtToEquity.toFixed(2)}`, 14, 84);
  doc.text(`Current Ratio: ${stockData.currentRatio.toFixed(2)}`, 14, 90);
  doc.text(`Margin of Safety Applied: ${formatPercent(marginOfSafetyParams.marginOfSafety)}`, 14, 96);
  
  // Add separator line
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 102, pageWidth - 14, 102);
  
  // DCF Calculation Section
  doc.setFontSize(16);
  doc.setTextColor(26, 32, 44);
  doc.text("DCF Analysis Calculation", 14, 112);
  
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text("Discounted Cash Flow (DCF) analysis estimates intrinsic value based on", 14, 120);
  doc.text("projected future free cash flows discounted to present value.", 14, 126);
  
  doc.setFontSize(12);
  doc.text("DCF Parameters:", 14, 136);
  doc.text(`Growth Rate: ${formatPercent(valuationParams.dcfGrowthRate)}`, 20, 144);
  doc.text(`Discount Rate: ${formatPercent(valuationParams.dcfDiscountRate)}`, 20, 150);
  doc.text(`Terminal Multiple: ${valuationParams.dcfTerminalMultiple}x`, 20, 156);
  doc.text(`Forecast Period: ${valuationParams.dcfForecastPeriod} years`, 20, 162);
  
  // DCF Calculation Step-by-Step
  doc.setFontSize(12);
  doc.text("DCF Calculation Steps:", 14, 172);
  
  let y = 180;
  const fcfProjections = calculateDCFProjections(stockData, valuationParams);
  
  doc.text(`1. Base Free Cash Flow Per Share: ${formatCurrency(stockData.fcfPerShare)}`, 20, y);
  y += 6;
  
  doc.text(`2. Projected Cash Flows:`, 20, y);
  y += 6;
  
  fcfProjections.forEach((fcf, index) => {
    const year = new Date().getFullYear() + index;
    doc.text(`   Year ${index + 1} (${year}): ${formatCurrency(fcf)}`, 20, y);
    y += 6;
  });
  
  // Calculate terminal value
  const terminalValue = fcfProjections[fcfProjections.length - 1] * valuationParams.dcfTerminalMultiple;
  doc.text(`3. Terminal Value: ${formatCurrency(terminalValue)}`, 20, y);
  y += 6;
  
  // Calculate the discount factors
  doc.text(`4. Discount Factors Applied:`, 20, y);
  y += 6;
  
  const discountFactors = fcfProjections.map((_, index) => {
    return 1 / Math.pow(1 + (valuationParams.dcfDiscountRate / 100), index + 1);
  });
  
  discountFactors.forEach((factor, index) => {
    doc.text(`   Year ${index + 1}: ${factor.toFixed(4)}`, 20, y);
    y += 6;
  });
  
  // If we need a new page
  if (y > 270) {
    doc.addPage();
    y = 20;
  }
  
  // Add terminal value discount factor
  const terminalValueDiscount = 1 / Math.pow(1 + (valuationParams.dcfDiscountRate / 100), 
                                           valuationParams.dcfForecastPeriod);
  doc.text(`   Terminal Value Discount: ${terminalValueDiscount.toFixed(4)}`, 20, y);
  y += 6;
  
  // Calculate discounted values
  const discountedCashFlows = fcfProjections.map((fcf, index) => fcf * discountFactors[index]);
  const discountedTerminalValue = terminalValue * terminalValueDiscount;
  
  doc.text(`5. Discounted Cash Flows:`, 20, y);
  y += 6;
  
  discountedCashFlows.forEach((dcf, index) => {
    doc.text(`   Year ${index + 1}: ${formatCurrency(dcf)}`, 20, y);
    y += 6;
  });
  
  doc.text(`   Discounted Terminal Value: ${formatCurrency(discountedTerminalValue)}`, 20, y);
  y += 6;
  
  // Calculate intrinsic value
  const intrinsicValue = discountedCashFlows.reduce((acc, val) => acc + val, 0) + discountedTerminalValue;
  
  doc.text(`6. Sum of Discounted Values: ${formatCurrency(intrinsicValue)}`, 20, y);
  y += 10;
  
  const dcfResult = valuationResults.find(r => r.method.includes('DCF'));
  
  doc.setFontSize(14);
  doc.setTextColor(0, 100, 0);
  doc.text(`DCF Intrinsic Value: ${formatCurrency(dcfResult?.intrinsicValue || intrinsicValue)}`, 14, y);
  y += 6;
  
  doc.text(`Buy Below Price (with MoS): ${formatCurrency(dcfResult?.buyBelow || 
                                                         (intrinsicValue * (1 - marginOfSafetyParams.marginOfSafety/100)))}`, 14, y);
  
  // Add a new page for P/E and Graham
  doc.addPage();
  
  // P/E Calculation Section
  doc.setFontSize(16);
  doc.setTextColor(26, 32, 44);
  doc.text("P/E Multiple Valuation", 14, 20);
  
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text("The P/E valuation method multiplies earnings per share by an appropriate", 14, 28);
  doc.text("P/E multiple to estimate intrinsic value.", 14, 34);
  
  doc.setFontSize(12);
  doc.text("P/E Parameters:", 14, 44);
  doc.text(`P/E Type: ${valuationParams.peType}`, 20, 52);
  if (valuationParams.peType === 'custom') {
    doc.text(`Custom P/E Value: ${valuationParams.peCustomValue}`, 20, 58);
  }
  doc.text(`P/E Adjustment: ${valuationParams.peAdjustment}%`, 20, 64);
  
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
  
  doc.setFontSize(12);
  doc.text("P/E Calculation Steps:", 14, 74);
  doc.text(`1. Earnings Per Share (EPS): ${formatCurrency(stockData.eps)}`, 20, 82);
  doc.text(`2. Selected P/E Multiple: ${valuationParams.peType === 'custom' ? 
                                      valuationParams.peCustomValue.toFixed(2) : 
                                      stockData.peRatio.toFixed(2)}`, 20, 88);
  doc.text(`3. Adjusted P/E Multiple (with ${valuationParams.peAdjustment}% adjustment): ${adjustedPE.toFixed(2)}`, 20, 94);
  doc.text(`4. Intrinsic Value Calculation: ${formatCurrency(stockData.eps)} × ${adjustedPE.toFixed(2)} = ${formatCurrency(peValue)}`, 20, 100);
  
  const peResult = valuationResults.find(r => r.method.includes('P/E'));
  
  doc.setFontSize(14);
  doc.setTextColor(0, 100, 0);
  doc.text(`P/E Based Intrinsic Value: ${formatCurrency(peResult?.intrinsicValue || peValue)}`, 14, 114);
  doc.text(`Buy Below Price (with MoS): ${formatCurrency(peResult?.buyBelow || 
                                                        (peValue * (1 - marginOfSafetyParams.marginOfSafety/100)))}`, 14, 120);
  
  // Graham Formula Section
  doc.setFontSize(16);
  doc.setTextColor(26, 32, 44);
  doc.text("Graham Formula Valuation", 14, 134);
  
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text("The Graham Formula estimates intrinsic value using Benjamin Graham's", 14, 142);
  doc.text("formula: V = EPS × (8.5 + 2g) where g is the growth rate.", 14, 148);
  
  doc.setFontSize(12);
  doc.text("Graham Parameters:", 14, 158);
  doc.text(`Base Value: ${valuationParams.grahamBaseValue}`, 20, 166);
  doc.text(`Growth Rate: ${formatPercent(valuationParams.grahamGrowthRate)}`, 20, 172);
  
  // Graham Calculation steps
  const grahamFormula = valuationParams.grahamBaseValue + (2 * valuationParams.grahamGrowthRate);
  const grahamValue = stockData.eps * grahamFormula;
  
  doc.setFontSize(12);
  doc.text("Graham Calculation Steps:", 14, 182);
  doc.text(`1. Earnings Per Share (EPS): ${formatCurrency(stockData.eps)}`, 20, 190);
  doc.text(`2. Graham Formula: ${valuationParams.grahamBaseValue} + (2 × ${valuationParams.grahamGrowthRate}%) = ${grahamFormula.toFixed(2)}`, 20, 196);
  doc.text(`3. Intrinsic Value Calculation: ${formatCurrency(stockData.eps)} × ${grahamFormula.toFixed(2)} = ${formatCurrency(grahamValue)}`, 20, 202);
  
  const grahamResult = valuationResults.find(r => r.method.includes('Graham'));
  
  doc.setFontSize(14);
  doc.setTextColor(0, 100, 0);
  doc.text(`Graham Formula Intrinsic Value: ${formatCurrency(grahamResult?.intrinsicValue || grahamValue)}`, 14, 216);
  doc.text(`Buy Below Price (with MoS): ${formatCurrency(grahamResult?.buyBelow || 
                                                       (grahamValue * (1 - marginOfSafetyParams.marginOfSafety/100)))}`, 14, 222);
  
  // Add a new page for the summary
  doc.addPage();
  
  // Summary of all valuation methods
  doc.setFontSize(16);
  doc.setTextColor(26, 32, 44);
  doc.text("Valuation Summary", 14, 20);
  
  // Create a summary table
  const tableHeaders = [['Valuation Method', 'Intrinsic Value', 'Buy Below', 'Discount/Premium']];
  const tableData = valuationResults.map(result => [
    result.method,
    formatCurrency(result.intrinsicValue),
    formatCurrency(result.buyBelow),
    `${result.discountPremium > 0 ? '+' : ''}${result.discountPremium.toFixed(1)}%`
  ]);
  
  doc.autoTable({
    startY: 30,
    head: tableHeaders,
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [42, 62, 92], textColor: [255, 255, 255] },
    bodyStyles: { textColor: [50, 50, 50] },
    alternateRowStyles: { fillColor: [240, 240, 240] }
  });
  
  // Add conclusion
  const avgResult = valuationResults.find(r => r.method === 'Average');
  if (avgResult) {
    // Get the last Y position after the table
    const lastY = (doc as any).lastAutoTable?.finalY || 160;
    
    doc.setFontSize(14);
    doc.setTextColor(26, 32, 44);
    doc.text("Conclusion", 14, lastY + 20);
    
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    doc.text(`Based on an average of all valuation methods, ${stockData.name} (${stockData.symbol})`, 14, lastY + 30);
    
    if (avgResult.discountPremium < 0) {
      doc.text(`appears to be trading at a ${Math.abs(avgResult.discountPremium).toFixed(1)}% discount to its calculated`, 14, lastY + 38);
      doc.text(`intrinsic value of ${formatCurrency(avgResult.intrinsicValue)}.`, 14, lastY + 46);
      
      doc.setFontSize(13);
      doc.setTextColor(0, 128, 0);
      if (avgResult.discountPremium < -25) {
        doc.text(`This represents a substantial margin of safety.`, 14, lastY + 56);
      } else if (avgResult.discountPremium < -10) {
        doc.text(`This represents a reasonable margin of safety.`, 14, lastY + 56);
      } else {
        doc.text(`This represents a modest discount to intrinsic value.`, 14, lastY + 56);
      }
    } else {
      doc.text(`appears to be trading at a ${avgResult.discountPremium.toFixed(1)}% premium to its calculated`, 14, lastY + 38);
      doc.text(`intrinsic value of ${formatCurrency(avgResult.intrinsicValue)}.`, 14, lastY + 46);
      
      doc.setFontSize(13);
      doc.setTextColor(200, 0, 0);
      doc.text(`This does not provide an adequate margin of safety.`, 14, lastY + 56);
    }
  }
  
  // Add disclaimer
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("DISCLAIMER: This report is generated for educational purposes only and should not be considered investment", 14, 270);
  doc.text("advice. All calculations are based on available data and assumptions. Always conduct your own research", 14, 275);
  doc.text("and consider consulting with a financial advisor before making investment decisions.", 14, 280);
  
  // Save the PDF
  const fileName = `${stockData.symbol}_Valuation_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
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