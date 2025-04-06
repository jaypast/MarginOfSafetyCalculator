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
  
  // Helper functions
  const getMethodColor = (method: string): string => {
    if (method.toLowerCase().includes('dcf')) return '#6366F1';  // Indigo
    if (method.toLowerCase().includes('p/e') || method.toLowerCase().includes('pe')) return '#F59E0B';  // Amber
    if (method.toLowerCase().includes('graham')) return '#4B5563';  // Dark Gray (instead of green)
    return '#6B7280';  // Gray
  };
  
  const getStatusColor = (discountPremium: number): string => {
    if (discountPremium <= -10) return 'text-green-800';
    if (discountPremium < 0) return 'text-amber-800';
    return 'text-red-800';
  };

  // Calculate value gap percentages for visualization
  const maxValue = Math.max(...valuationResults.map(r => r.intrinsicValue), stockData ? stockData.price * 1.5 : 300); // Max for scale
  
  // Calculate percentages for active method
  const intrinsicPercent = (activeResult.intrinsicValue / maxValue) * 100;
  const buyBelowPercent = (activeResult.buyBelow / maxValue) * 100;
  const currentPercent = stockData ? (stockData.price / maxValue) * 100 : 0;
  
  // Calculate percentages for just DCF, P/E, and Graham methods
  const methodLines = valuationResults
    .filter(r => {
      const method = r.method.toLowerCase();
      return (
        method.includes('dcf') || 
        method.includes('p/e') || 
        method.includes('pe') || 
        method.includes('graham')
      );
    })
    .map(result => ({
      method: result.method,
      intrinsicPercent: (result.intrinsicValue / maxValue) * 100,
      buyBelowPercent: (result.buyBelow / maxValue) * 100,
      color: getMethodColor(result.method)
    }));

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
          <div className="bg-gray-100 p-3 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-700 mb-1">Buy Below</p>
            <p className="text-lg font-bold text-gray-800">
              {formatCurrency(activeResult.buyBelow)}
            </p>
            <p className="text-xs text-gray-600">With MoS</p>
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
          <div className="h-10 bg-neutral-100 rounded-lg relative overflow-hidden">
            {/* Background bars for base values */}
            <div 
              className="absolute top-0 bottom-0 left-0 bg-[#415876] flex items-center justify-end px-2"
              style={{ width: `${intrinsicPercent}%` }}
            >
              <span className="text-white text-xs font-medium whitespace-nowrap">IV: {formatCurrency(activeResult.intrinsicValue)}</span>
            </div>
            <div 
              className="absolute top-0 bottom-0 left-0 bg-gray-600 flex items-center justify-end px-2"
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
            
            {/* Add vertical lines for the three main methods */}
            {methodLines.map((line, index) => (
              <div key={index} className="contents">
                {/* Intrinsic Value Line */}
                <div
                  className="absolute top-0 bottom-0 border-l-2 pointer-events-none z-10"
                  style={{ 
                    left: `${line.intrinsicPercent}%`, 
                    borderColor: line.color 
                  }}
                ></div>
                
                {/* Buy Below Line */}
                <div
                  className="absolute top-0 bottom-0 border-l-2 border-dashed pointer-events-none z-10"
                  style={{ 
                    left: `${line.buyBelowPercent}%`, 
                    borderColor: line.color 
                  }}
                ></div>
              </div>
            ))}
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
                    <TableCell className="text-neutral-800">
                      <div className="flex items-center">
                        <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: getMethodColor(result.method) }}></span>
                        {result.method}
                      </div>
                    </TableCell>
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
