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
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold text-[#1A2942] mb-6">Valuation Results</h2>
          <div className="text-center py-10 text-neutral-500">
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
      <CardContent className="p-6">
        <h2 className="text-xl font-semibold text-[#1A2942] mb-6">Valuation Results</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {/* Intrinsic Value */}
          <div className="bg-[#E9ECF1] p-4 rounded-lg border border-[#C4CCD9]">
            <p className="text-sm text-[#2A3E5C] mb-1">Intrinsic Value</p>
            <p className="text-2xl font-bold text-[#1A2942]">
              {formatCurrency(activeResult.intrinsicValue)}
            </p>
            <p className="text-xs text-[#415876] mt-1">Based on {activeResult.method}</p>
          </div>
          
          {/* Buy Below Price */}
          <div className="bg-green-50 p-4 rounded-lg border border-green-100">
            <p className="text-sm text-green-700 mb-1">Buy Below Price</p>
            <p className="text-2xl font-bold text-green-800">
              {formatCurrency(activeResult.buyBelow)}
            </p>
            <p className="text-xs text-green-600 mt-1">With {stockData ? activeResult.discountPremium.toFixed(1) + '%' : '-'} Margin of Safety</p>
          </div>
          
          {/* Current Status */}
          <div className={`${activeResult.discountPremium < 0 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'} p-4 rounded-lg`}>
            <p className={`text-sm ${activeResult.discountPremium < 0 ? 'text-amber-700' : 'text-red-700'} mb-1`}>Current Status</p>
            <p className={`text-2xl font-bold ${getStatusColor(activeResult.discountPremium)}`}>
              {activeResult.discountPremium > 0 ? '+' : ''}{activeResult.discountPremium.toFixed(1)}%
            </p>
            <p className={`text-xs ${activeResult.discountPremium < 0 ? 'text-amber-600' : 'text-red-600'} mt-1`}>
              {activeResult.discountPremium < 0 ? 'Below buy price: Consider buying' : 'Above buy price: Wait'}
            </p>
          </div>
        </div>
        
        {/* Value Gap Visualization */}
        <div className="mb-8">
          <h3 className="text-lg font-medium text-[#21324F] mb-3">Value Gap</h3>
          <div className="h-14 bg-neutral-100 rounded-lg relative overflow-hidden">
            <div 
              className="absolute top-0 bottom-0 left-0 bg-[#415876] flex items-center justify-end px-2"
              style={{ width: `${intrinsicPercent}%` }}
            >
              <span className="text-white text-sm font-medium">Intrinsic Value: {formatCurrency(activeResult.intrinsicValue)}</span>
            </div>
            <div 
              className="absolute top-0 bottom-0 left-0 bg-green-500 flex items-center justify-end px-2"
              style={{ width: `${buyBelowPercent}%` }}
            >
              <span className="text-white text-sm font-medium">Buy Below: {formatCurrency(activeResult.buyBelow)}</span>
            </div>
            {stockData && (
              <div 
                className={`absolute top-0 bottom-0 left-0 ${activeResult.discountPremium < 0 ? 'bg-amber-500' : 'bg-red-500'} flex items-center justify-end px-2`}
                style={{ width: `${currentPercent}%` }}
              >
                <span className="text-white text-sm font-medium">Current: {formatCurrency(stockData.price)}</span>
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
        
        {/* Method Comparison */}
        <div>
          <h3 className="text-lg font-medium text-[#21324F] mb-3">Valuation Method Comparison</h3>
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
