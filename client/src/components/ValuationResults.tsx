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
import { StockData, ValuationResult, CalculationMethod } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface ValuationResultsProps {
  valuationResults: ValuationResult[];
  stockData: StockData | undefined;
  activeMethod: CalculationMethod;
}

const ValuationResults: React.FC<ValuationResultsProps> = ({
  valuationResults,
  stockData,
  activeMethod
}) => {
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

  // Find active method result
  const activeResult = valuationResults.find(
    result => result.method.toLowerCase().includes(activeMethod)
  ) || valuationResults[0];
  
  // Find average result
  const averageResult = valuationResults.find(
    result => result.method === 'Average'
  );

  // Calculate value gap percentages for visualization
  const maxValue = Math.max(...valuationResults.map(r => r.intrinsicValue), 300); // Max for scale
  const intrinsicPercent = (activeResult.intrinsicValue / maxValue) * 100;
  const buyBelowPercent = (activeResult.buyBelow / maxValue) * 100;
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
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {/* Intrinsic Value */}
          <div className="bg-[#E9ECF1] p-3 rounded-lg border border-[#C4CCD9]">
            <p className="text-xs text-[#2A3E5C] mb-1">Intrinsic Value</p>
            <p className="text-lg font-bold text-[#1A2942]">
              {formatCurrency(activeResult.intrinsicValue)}
            </p>
            <p className="text-xs text-[#415876]">{activeResult.method}</p>
          </div>
          
          {/* Buy Below Price */}
          <div className="bg-green-50 p-3 rounded-lg border border-green-100">
            <p className="text-xs text-green-700 mb-1">Buy Below</p>
            <p className="text-lg font-bold text-green-800">
              {formatCurrency(activeResult.buyBelow)}
            </p>
            <p className="text-xs text-green-600">With MoS</p>
          </div>
          
          {/* Current Status */}
          <div className={`${activeResult.discountPremium < 0 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'} p-3 rounded-lg`}>
            <p className={`text-xs ${activeResult.discountPremium < 0 ? 'text-amber-700' : 'text-red-700'} mb-1`}>Status</p>
            <p className={`text-lg font-bold ${getStatusColor(activeResult.discountPremium)}`}>
              {activeResult.discountPremium > 0 ? '+' : ''}{activeResult.discountPremium.toFixed(1)}%
            </p>
            <p className={`text-xs ${activeResult.discountPremium < 0 ? 'text-amber-600' : 'text-red-600'}`}>
              {activeResult.discountPremium < 0 ? 'Consider buying' : 'Wait'}
            </p>
          </div>
        </div>
        
        {/* Value Gap Visualization */}
        <div className="mb-6">
          <h3 className="text-base font-medium text-[#21324F] mb-2">Value Gap</h3>
          <div className="h-12 bg-neutral-100 rounded-lg relative overflow-hidden mb-2">
            {/* Render bars in specific order to ensure proper layering */}
            {/* Intrinsic Value (back) */}
            <div 
              className="absolute top-0 bottom-0 left-0 bg-[#415876] flex items-center justify-center"
              style={{ width: `${intrinsicPercent}%` }}
            >
            </div>
            
            {/* Buy Below (middle) */}
            <div 
              className="absolute top-0 bottom-0 left-0 bg-green-500 flex items-center justify-center"
              style={{ width: `${buyBelowPercent}%` }}
            >
            </div>
            
            {/* Current Price (front) */}
            {stockData && (
              <div 
                className={`absolute top-0 bottom-0 left-0 ${activeResult.discountPremium < 0 ? 'bg-amber-500' : 'bg-red-500'} flex items-center justify-center`}
                style={{ width: `${currentPercent}%` }}
              >
              </div>
            )}
            
            {/* Labels positioned at appropriate locations */}
            <div className="absolute top-0 bottom-0 flex items-center justify-between w-full px-2 z-10 pointer-events-none">
              {/* Prices are shown outside the bars for better readability */}
              <div className="flex justify-between w-full">
                {stockData && (
                  <div className="bg-white px-1 py-0.5 rounded shadow-sm border text-xs">
                    <span className="font-semibold">Now:</span> {formatCurrency(stockData.price)}
                  </div>
                )}
                <div className="bg-white px-1 py-0.5 rounded shadow-sm border text-xs ml-auto mr-1">
                  <span className="font-semibold text-green-700">Buy:</span> {formatCurrency(activeResult.buyBelow)}
                </div>
                <div className="bg-white px-1 py-0.5 rounded shadow-sm border text-xs">
                  <span className="font-semibold text-blue-700">IV:</span> {formatCurrency(activeResult.intrinsicValue)}
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-between text-xs text-neutral-500 mt-1">
            <span>$0</span>
            <span>${Math.round(maxValue * 0.33)}</span>
            <span>${Math.round(maxValue * 0.66)}</span>
            <span>${Math.round(maxValue)}</span>
          </div>
        </div>
        
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
                    <TableCell className="text-neutral-800 text-right">{formatCurrency(result.intrinsicValue)}</TableCell>
                    <TableCell className="text-neutral-800 text-right">{formatCurrency(result.buyBelow)}</TableCell>
                    <TableCell className={`${result.discountPremium < 0 ? 'text-green-600' : 'text-red-600'} text-right`}>
                      {result.discountPremium > 0 ? '+' : ''}{result.discountPremium.toFixed(1)}%
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
      </CardContent>
    </Card>
  );
};

export default ValuationResults;
