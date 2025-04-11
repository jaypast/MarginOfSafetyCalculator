import React from 'react';
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
import { FileText } from 'lucide-react';
import { StockData, ValuationResult, CalculationMethod, ValuationParams, MarginOfSafetyParams } from '@/lib/types';
import { formatCurrency, isETF } from '@/lib/utils';
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

  // Find active method result
  const activeResult = valuationResults.find(
    result => result.method.toLowerCase().includes(activeMethod)
  ) || valuationResults[0];
  
  // Find average result
  const averageResult = valuationResults.find(
    result => result.method === 'Average'
  );
  
  // Check for special cases like MicroStrategy with negative or extreme values
  const hasNegativeIntrinsicValue = activeResult.intrinsicValue <= 0;
  const hasExtremeDiscountPremium = Math.abs(activeResult.discountPremium) > 5000;
  const isSpecialCase = hasNegativeIntrinsicValue || hasExtremeDiscountPremium;
  
  // Calculate value gap percentages for visualization
  const maxValue = Math.max(...valuationResults.map(r => r.intrinsicValue > 0 ? r.intrinsicValue : 0), 
                            stockData ? stockData.price * 1.5 : 300); // Max for scale
  const intrinsicPercent = !hasNegativeIntrinsicValue ? (activeResult.intrinsicValue / maxValue) * 100 : 0;
  const buyBelowPercent = activeResult.buyBelow > 0 ? (activeResult.buyBelow / maxValue) * 100 : 0;
  const currentPercent = stockData ? (stockData.price / maxValue) * 100 : 0;

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
          // Normal valuation display for regular stocks
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
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
              <p className={`text-xs ${activeResult.discountPremium < 0 ? 'text-amber-700' : 'text-red-700'} mb-1`}>Status</p>
              <p className={`text-lg font-bold ${getStatusColor(activeResult.discountPremium)}`}>
                {!hasExtremeDiscountPremium ? 
                  `${activeResult.discountPremium > 0 ? '+' : ''}${activeResult.discountPremium.toFixed(1)}%` 
                  : 'N/A'}
              </p>
              <p className={`text-xs ${activeResult.discountPremium < 0 ? 'text-amber-600' : 'text-red-600'}`}>
                {activeResult.discountPremium < 0 ? 'Consider buying' : 'Wait'}
              </p>
            </div>
          </div>
        )}
        
        {/* Value Gap Visualization - only show for valid calculation cases */}
        {!isSpecialCase && !hasNegativeIntrinsicValue && !hasExtremeDiscountPremium && (
          <div className="mb-6">
            <h3 className="text-base font-medium text-[#21324F] mb-2">Value Gap</h3>
            <div className="h-10 bg-neutral-100 rounded-lg relative overflow-hidden">
              <div 
                className="absolute top-0 bottom-0 left-0 bg-[#415876] flex items-center justify-end px-2"
                style={{ width: `${intrinsicPercent}%` }}
              >
                <span className="text-white text-xs font-medium whitespace-nowrap">IV: {formatCurrency(activeResult.intrinsicValue)}</span>
              </div>
              <div 
                className="absolute top-0 bottom-0 left-0 bg-green-500 flex items-center justify-end px-2"
                style={{ width: `${buyBelowPercent}%` }}
              >
                <span className="text-white text-xs font-medium whitespace-nowrap">Buy: {formatCurrency(activeResult.buyBelow)}</span>
              </div>
              {stockData && (
                <div 
                  className={`absolute top-0 bottom-0 left-0 ${activeResult.discountPremium < 0 ? 'bg-amber-500' : 'bg-red-500'} flex items-center justify-end px-2`}
                  style={{ width: `${currentPercent}%` }}
                >
                  <span className="text-white text-xs font-medium whitespace-nowrap">Now: {formatCurrency(stockData.price)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between text-xs text-neutral-500 mt-1">
              <span>$0</span>
              <span>${Math.round(maxValue * 0.33)}</span>
              <span>${Math.round(maxValue * 0.66)}</span>
              <span>${Math.round(maxValue)}</span>
            </div>
          </div>
        )}
        
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
        
        {/* Show Work Button - PDF Export */}
        {stockData && valuationParams && marginOfSafetyParams && !etfDetected && !isSpecialCase && (
          <div className="mt-6 flex justify-center">
            <Button 
              variant="outline" 
              className="flex items-center gap-2 border-[#1A2942] text-[#1A2942] hover:bg-[#E9ECF1]"
              onClick={() => {
                generateCalculationsPDF(
                  stockData,
                  valuationParams,
                  marginOfSafetyParams,
                  valuationResults
                );
              }}
            >
              <FileText size={18} />
              Show Work
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ValuationResults;
