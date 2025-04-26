import React, { useState } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow
} from "@/components/ui/table";
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, TrendingDown, TrendingUp, Pause } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StockData, ValuationResult, CalculationMethod, ValuationParams, MarginOfSafetyParams } from '@/lib/types';
import { formatCurrency, isETF, getInvestmentRecommendation } from '@/lib/utils';
import { generateCalculationsPDF } from '@/utils/pdfGenerator';

interface ValuationResultsProps {
  valuationResults: ValuationResult[];
  stockData: StockData | undefined;
  activeMethod: CalculationMethod;
  valuationParams?: ValuationParams;
  marginOfSafetyParams?: MarginOfSafetyParams;
}

const ValuationResults: React.FC<ValuationResultsProps> = ({
  valuationResults,
  stockData,
  activeMethod,
  valuationParams,
  marginOfSafetyParams
}) => {
  // Add state for dialog control and report content
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportContent, setReportContent] = useState("");
  
  // Check if the stock is an ETF
  const etfDetected = stockData && isETF(stockData);
  
  if (!valuationResults.length) {
    return (
      <Card className="bg-white rounded-lg shadow-sm border border-neutral-200">
        <CardContent className="p-4">
          <h2 className="text-xl font-semibold text-[#1A2942] mb-2">Valuation Results</h2>
          <div className="text-center py-8 text-neutral-500">
            <p>Enter a stock symbol and click "Calculate Intrinsic Value" to view results</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // If ETF is detected, show a special information card
  if (etfDetected) {
    return (
      <Card className="bg-white rounded-lg shadow-sm border border-neutral-200">
        <CardContent className="p-4">
          <h2 className="text-xl font-semibold text-[#1A2942] mb-2">
            Valuation Results {stockData && <span className="text-sm font-normal">- {stockData.name}</span>}
          </h2>
          
          {stockData && (
            <div className="flex items-center mb-3 bg-blue-50 p-2 rounded-md border border-blue-100 inline-block">
              <p className="text-sm text-blue-700 mr-2">Current Price:</p>
              <p className="text-lg font-bold text-blue-800">{formatCurrency(stockData.price)}</p>
            </div>
          )}
          
          <div className="bg-amber-50 p-4 rounded-lg mb-4 border border-amber-100">
            <h3 className="text-lg font-medium text-amber-700 mb-2">ETF or Index Fund Detected</h3>
            <p className="text-sm text-gray-700 mb-2">
              This appears to be an ETF or Index Fund. These investments track baskets of securities and 
              don't represent individual companies, so traditional valuation methods like DCF or P/E ratios 
              don't apply.
            </p>
            <p className="text-sm text-gray-700">
              Consider these factors instead:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-700 mt-2 space-y-1 ml-2">
              <li>Expense ratio (lower is better)</li>
              <li>Tracking error vs benchmark</li>
              <li>Liquidity and trading volume</li>
              <li>Sector/asset allocation</li>
              <li>Historical performance</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Find average result (we'll prioritize this for display)
  const averageResult = valuationResults.find(
    result => result.method === 'Average'
  );
  
  // This ensures our main valuation metrics align with the recommendation
  const activeResult = averageResult || valuationResults.find(
    result => result.method.toLowerCase().includes(activeMethod)
  ) || valuationResults[0];
  
  // Calculate the discount/premium directly using the current stock price for guaranteed accuracy
  // This ensures it's always up-to-date regardless of how the values were calculated
  if (stockData) {
    // Update the average result's discount/premium
    if (averageResult && averageResult.intrinsicValue > 0) {
      const avgDiscountPremium = ((stockData.price - averageResult.intrinsicValue) / averageResult.intrinsicValue) * 100;
      averageResult.discountPremium = parseFloat(avgDiscountPremium.toFixed(1));
    }
    
    // Update the active result's discount/premium
    if (activeResult && activeResult.intrinsicValue > 0 && activeResult !== averageResult) {
      const activeDiscountPremium = ((stockData.price - activeResult.intrinsicValue) / activeResult.intrinsicValue) * 100;
      activeResult.discountPremium = parseFloat(activeDiscountPremium.toFixed(1));
    }
    
    // Update all individual method results too
    valuationResults
      .filter(result => result.method !== 'Average' && result.intrinsicValue > 0)
      .forEach(result => {
        const methodDiscountPremium = ((stockData.price - result.intrinsicValue) / result.intrinsicValue) * 100;
        result.discountPremium = parseFloat(methodDiscountPremium.toFixed(1));
      });
  }
  
  // Check for special cases like MicroStrategy with negative or extreme values
  const hasNegativeIntrinsicValue = activeResult.intrinsicValue <= 0;
  const hasExtremeDiscountPremium = Math.abs(activeResult.discountPremium) > 5000;
  const isSpecialCase = hasNegativeIntrinsicValue || hasExtremeDiscountPremium;
  
  // Determine status color
  const getStatusColor = (discountPremium: number): string => {
    if (discountPremium <= -10) return 'text-green-800';
    if (discountPremium < 0) return 'text-amber-800';
    return 'text-red-800';
  };

  return (
    <Card className="bg-white rounded-lg shadow-sm border border-neutral-200">
      <CardContent className="p-4">
        <h2 className="text-xl font-semibold text-[#1A2942] mb-2">
          Valuation Results {stockData && <span className="text-sm font-normal">- {stockData.name}</span>}
        </h2>
        
        {/* Current Price - Added at the top for prominence */}
        {stockData && (
          <div className="flex items-center mb-3 bg-blue-50 p-2 rounded-md border border-blue-100 inline-block">
            <p className="text-sm text-blue-700 mr-2">Current Price:</p>
            <p className="text-lg font-bold text-blue-800">{formatCurrency(stockData.price)}</p>
          </div>
        )}
        
        {isSpecialCase ? (
          // Special message for stocks with negative or extreme values
          <div className="bg-amber-50 p-4 rounded-lg mb-4 border border-amber-100">
            <h3 className="text-lg font-medium text-amber-700 mb-2">Special Case Detected</h3>
            <p className="text-sm text-gray-700 mb-2">
              This company appears to have characteristics that make traditional valuation methods challenging:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-700 ml-2 mb-2">
              {hasNegativeIntrinsicValue && <li>Negative or unpredictable earnings</li>}
              {hasExtremeDiscountPremium && <li>Extremely high growth expectations or non-standard business model</li>}
              {stockData?.symbol === 'MSTR' && <li>Large Bitcoin holdings that affect traditional valuation metrics</li>}
            </ul>
            <p className="text-sm text-gray-700">
              Consider using alternative valuation approaches or conducting deeper research into this company's specific situation.
            </p>
          </div>
        ) : (
          <>
            {/* Prominent action recommendation */}
            {averageResult && (
              <div className="mb-6">
                {(() => {
                  // Get recommendation based on average result
                  const recommendation = getInvestmentRecommendation(averageResult.discountPremium);
                  
                  // Determine styling based on recommendation
                  const styles: Record<string, {
                    background: string;
                    border: string;
                    text: string;
                    icon: React.ReactNode;
                  }> = {
                    'UNDERVALUED': {
                      background: "bg-green-100", 
                      border: "border-green-300",
                      text: "text-green-800",
                      icon: <TrendingDown className="h-6 w-6 text-green-600 mr-2" />
                    },
                    'FAIRLY VALUED': {
                      background: "bg-amber-100", 
                      border: "border-amber-300",
                      text: "text-amber-800",
                      icon: <Pause className="h-6 w-6 text-amber-600 mr-2" />
                    },
                    'OVERVALUED': {
                      background: "bg-red-100", 
                      border: "border-red-300",
                      text: "text-red-800",
                      icon: <TrendingUp className="h-6 w-6 text-red-600 mr-2" />
                    }
                  };
                  
                  const style = styles[recommendation.action];
                  
                  return (
                    <div className={`${style.background} p-4 rounded-lg ${style.border} flex flex-col items-center justify-center`}>
                      <div className="flex items-center justify-center mb-2">
                        {style.icon}
                        <h3 className={`text-2xl font-bold ${style.text}`}>
                          {recommendation.action}
                        </h3>
                      </div>
                      <p className={`text-sm ${style.text} text-center`}>
                        {recommendation.rationale}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          
            {/* Valuation metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              {/* Intrinsic Value */}
              <div className="bg-[#E9ECF1] p-3 rounded-lg border border-[#C4CCD9]">
                <p className="text-xs text-[#2A3E5C] mb-1">Intrinsic Value</p>
                <p className="text-lg font-bold text-[#1A2942]">
                  {activeResult.intrinsicValue > 0 ? formatCurrency(activeResult.intrinsicValue) : 'N/A'}
                </p>
                <p className="text-xs text-[#415876]">{activeResult.method}</p>
              </div>
              
              {/* Buy Below Price */}
              <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                <p className="text-xs text-green-700 mb-1">Buy Below</p>
                <p className="text-lg font-bold text-green-800">
                  {activeResult.buyBelow > 0 ? formatCurrency(activeResult.buyBelow) : 'N/A'}
                </p>
                <p className="text-xs text-green-600">With MoS</p>
              </div>
              
              {/* Current Status */}
              <div className={`${activeResult.discountPremium < 0 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'} p-3 rounded-lg`}>
                <p className={`text-xs ${activeResult.discountPremium < 0 ? 'text-amber-700' : 'text-red-700'} mb-1`}>Discount/Premium</p>
                <p className={`text-lg font-bold ${getStatusColor(activeResult.discountPremium)}`}>
                  {!hasExtremeDiscountPremium ? 
                    `${activeResult.discountPremium > 0 ? '+' : ''}${activeResult.discountPremium.toFixed(1)}%` 
                    : 'N/A'}
                </p>
                <p className={`text-xs ${activeResult.discountPremium < 0 ? 'text-amber-600' : 'text-red-600'}`}>
                  Current vs. intrinsic value
                </p>
              </div>
            </div>
          </>
        )}
        
        {/* Chart section removed for better performance and reliability */}
        
        {/* Method Comparison */}
        <div>
          <h3 className="text-base font-medium text-[#21324F] mb-2">Valuation Methods</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Method</TableHead>
                  <TableHead className="text-right">Intrinsic Value</TableHead>
                  <TableHead className="text-right">Buy Below</TableHead>
                  <TableHead className="text-right">Discount/Premium</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {valuationResults.filter(r => r.method !== 'Average').map((result, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-neutral-800">{result.method}</TableCell>
                    <TableCell className="text-neutral-800 text-right">
                      {result.intrinsicValue <= 0 ? 'N/A' : formatCurrency(result.intrinsicValue)}
                    </TableCell>
                    <TableCell className="text-neutral-800 text-right">
                      {result.buyBelow <= 0 ? 'N/A' : formatCurrency(result.buyBelow)}
                    </TableCell>
                    <TableCell className={`${result.discountPremium < 0 ? 'text-green-600' : 'text-red-600'} text-right`}>
                      {result.intrinsicValue <= 0 ? 'N/A' : 
                        `${result.discountPremium > 0 ? '+' : ''}${result.discountPremium.toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                ))}
                {averageResult && (
                  <TableRow className="bg-[#E9ECF1]">
                    <TableCell className="font-medium text-[#21324F]">{averageResult.method}</TableCell>
                    <TableCell className="font-medium text-[#21324F] text-right">{formatCurrency(averageResult.intrinsicValue)}</TableCell>
                    <TableCell className="font-medium text-[#21324F] text-right">{formatCurrency(averageResult.buyBelow)}</TableCell>
                    <TableCell className={`font-medium ${averageResult.discountPremium < 0 ? 'text-green-600' : 'text-red-600'} text-right`}>
                      {averageResult.discountPremium > 0 ? '+' : ''}{averageResult.discountPremium.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        
        {/* Show Work Button - Display Report in Dialog */}
        {stockData && valuationParams && marginOfSafetyParams && !etfDetected && !isSpecialCase && (
          <div className="mt-6 flex justify-center">
            <Button 
              variant="outline" 
              className="flex items-center gap-2 border-[#1A2942] text-[#1A2942] hover:bg-[#E9ECF1]"
              onClick={() => {
                // Generate the report content
                const content = generateCalculationsPDF(
                  stockData,
                  valuationParams,
                  marginOfSafetyParams,
                  valuationResults
                );
                setReportContent(content);
                setShowReportDialog(true);
              }}
              title="View detailed valuation calculations"
            >
              <FileText size={18} />
              Show Work
            </Button>
          </div>
        )}
        
        {/* Dialog for showing the report */}
        <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                Valuation Calculation Details: {stockData?.name} ({stockData?.symbol})
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[70vh] rounded border p-4 bg-gray-50">
              <pre className="font-mono text-sm whitespace-pre-wrap">{reportContent}</pre>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default ValuationResults;