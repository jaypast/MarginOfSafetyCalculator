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
  const maxValue = Math.max(...valuationResults.map(r => r.intrinsicValue), stockData ? stockData.price * 1.5 : 300); // Max for scale
  
  // Current method calculations
  const intrinsicPercent = (activeResult.intrinsicValue / maxValue) * 100;
  const buyBelowPercent = (activeResult.buyBelow / maxValue) * 100;
  const currentPercent = stockData ? (stockData.price / maxValue) * 100 : 0;
  
  // Get percentages for all methods to visualize
  const methodPercentages = valuationResults.filter(r => r.method !== 'Average').map(result => ({
    method: result.method,
    intrinsicPercent: (result.intrinsicValue / maxValue) * 100,
    buyBelowPercent: (result.buyBelow / maxValue) * 100,
  }));

  // Determine status color (avoiding red and green)
  const getStatusColor = (discountPremium: number): string => {
    if (discountPremium <= -10) return 'text-blue-800';
    if (discountPremium < 0) return 'text-indigo-800';
    return 'text-purple-800';
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
          <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
            <p className="text-xs text-indigo-700 mb-1">Buy Below</p>
            <p className="text-lg font-bold text-indigo-800">
              {formatCurrency(activeResult.buyBelow)}
            </p>
            <p className="text-xs text-indigo-600">With MoS</p>
          </div>
          
          {/* Current Status */}
          <div className={`${activeResult.discountPremium < 0 ? 'bg-blue-50 border-blue-100' : 'bg-purple-50 border-purple-100'} p-3 rounded-lg`}>
            <p className={`text-xs ${activeResult.discountPremium < 0 ? 'text-blue-700' : 'text-purple-700'} mb-1`}>Status</p>
            <p className={`text-lg font-bold ${getStatusColor(activeResult.discountPremium)}`}>
              {activeResult.discountPremium > 0 ? '+' : ''}{activeResult.discountPremium.toFixed(1)}%
            </p>
            <p className={`text-xs ${activeResult.discountPremium < 0 ? 'text-blue-600' : 'text-purple-600'}`}>
              {activeResult.discountPremium < 0 ? 'Consider buying' : 'Wait'}
            </p>
          </div>
        </div>
        
        {/* Value Gap Visualization - Simplified */}
        <div className="mb-6">
          <h3 className="text-base font-medium text-[#21324F] mb-2">Value Gap</h3>
          
          {/* Single bar with all methods */}
          <div className="relative">
            <div className="h-12 bg-neutral-100 rounded-lg relative overflow-hidden">
              {/* Buy Below lines for each method */}
              {methodPercentages.map((method, index) => {
                const colors = ['bg-purple-500', 'bg-blue-500', 'bg-indigo-500', 'bg-orange-500'];
                const color = colors[index % colors.length];
                return (
                  <React.Fragment key={index}>
                    {/* Method marker line */}
                    <div
                      className={`absolute top-0 bottom-0 border-l-2 ${color.replace('bg-', 'border-')} z-20`}
                      style={{ left: `${method.intrinsicPercent}%` }}
                    >
                      <div className={`${color.replace('bg-', 'bg-')} w-2 h-2 rounded-full mt-1`}></div>
                    </div>
                    
                    {/* Buy Below marker line */}
                    <div
                      className={`absolute top-0 bottom-0 border-l-2 border-dashed ${color.replace('bg-', 'border-')} z-10 opacity-50`}
                      style={{ left: `${method.buyBelowPercent}%` }}
                    >
                      <div className={`${color.replace('bg-', 'bg-')} w-2 h-2 rounded-full mt-9`}></div>
                    </div>
                  </React.Fragment>
                );
              })}
              
              {/* Average method line if available */}
              {averageResult && (
                <React.Fragment>
                  {/* Average Intrinsic Value line */}
                  <div
                    className="absolute top-0 bottom-0 border-l-2 border-gray-600 z-30"
                    style={{ left: `${(averageResult.intrinsicValue / maxValue) * 100}%` }}
                  >
                    <div className="bg-gray-600 w-2 h-2 rounded-full mt-1"></div>
                  </div>
                  
                  {/* Average Buy Below line */}
                  <div
                    className="absolute top-0 bottom-0 border-l-2 border-dashed border-gray-600 z-20 opacity-50"
                    style={{ left: `${(averageResult.buyBelow / maxValue) * 100}%` }}
                  >
                    <div className="bg-gray-600 w-2 h-2 rounded-full mt-9"></div>
                  </div>
                </React.Fragment>
              )}
              
              {/* Current price marker */}
              {stockData && (
                <div
                  className="absolute top-0 bottom-0 border-l-2 border-blue-500 z-50"
                  style={{ left: `${currentPercent}%` }}
                >
                  <div className="bg-blue-500 w-2 h-2 rounded-full mt-5"></div>
                  <div className="bg-blue-500 text-white px-1 py-0.5 rounded text-xs absolute top-4 -translate-x-1/2">
                    ${stockData.price}
                  </div>
                </div>
              )}
            </div>
            
            {/* Legend */}
            <div className="flex justify-between items-center mt-1 text-xs">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-1"></div>
                <span>Current Price</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 border border-gray-500 bg-transparent rounded-full mr-1"></div>
                <span>IV</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 border border-dashed border-gray-500 bg-transparent rounded-full mr-1"></div>
                <span>Buy Below</span>
              </div>
            </div>
          </div>
          
          <div className="flex justify-between text-xs text-neutral-500 mt-3">
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
                    <TableCell className={`${result.discountPremium < 0 ? 'text-blue-600' : 'text-purple-600'} text-right`}>
                      {result.discountPremium > 0 ? '+' : ''}{result.discountPremium.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
                {averageResult && (
                  <TableRow className="bg-[#E9ECF1]">
                    <TableCell className="font-medium text-[#21324F]">{averageResult.method}</TableCell>
                    <TableCell className="font-medium text-[#21324F] text-right">{formatCurrency(averageResult.intrinsicValue)}</TableCell>
                    <TableCell className="font-medium text-[#21324F] text-right">{formatCurrency(averageResult.buyBelow)}</TableCell>
                    <TableCell className={`font-medium ${averageResult.discountPremium < 0 ? 'text-blue-600' : 'text-purple-600'} text-right`}>
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
