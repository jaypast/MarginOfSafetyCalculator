import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StockData } from '@/lib/types';
import { formatCurrency, formatPercent } from '@/lib/utils';

interface StockInformationProps {
  stockData: StockData | undefined;
  isLoading: boolean;
  onFetchData: (symbol: string) => void;
  companyQuality?: 'Exceptional' | 'Good' | 'Average' | 'Speculative';
}

const StockInformation: React.FC<StockInformationProps> = ({ 
  stockData, 
  isLoading, 
  onFetchData,
  companyQuality
}) => {
  const [symbolInput, setSymbolInput] = useState('');

  const handleSymbolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSymbolInput(e.target.value);
  };

  const handleFetchData = () => {
    onFetchData(symbolInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleFetchData();
    }
  };

  const getQualityColorClass = (quality?: string) => {
    switch (quality) {
      case 'Exceptional':
        return 'bg-success-100 text-success-800';
      case 'Good':
        return 'bg-teal-100 text-teal-800';
      case 'Average':
        return 'bg-amber-100 text-amber-800';
      case 'Speculative':
        return 'bg-rose-100 text-rose-800';
      default:
        return 'bg-neutral-100 text-neutral-800';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-neutral-200">
      <h2 className="text-xl font-semibold text-[#1A2942] mb-4">Stock Information</h2>
      
      {/* Stock Symbol Input */}
      <div className="mb-6">
        <label htmlFor="stockSymbol" className="block text-sm font-medium text-neutral-700 mb-2">Stock Symbol</label>
        <div className="flex">
          <Input
            id="stockSymbol"
            value={symbolInput}
            onChange={handleSymbolChange}
            onKeyDown={handleKeyDown}
            className="custom-input rounded-r-none focus:z-10"
            placeholder="e.g. AAPL"
          />
          <Button
            onClick={handleFetchData}
            disabled={isLoading}
            className="bg-[#21324F] hover:bg-[#1A2942] text-white font-medium rounded-l-none"
          >
            {isLoading ? (
              <span className="flex items-center">Loading...</span>
            ) : (
              <span className="flex items-center">
                <i className="ri-search-line mr-1"></i> Fetch
              </span>
            )}
          </Button>
        </div>
        <p className="mt-2 text-sm text-neutral-500">Enter a valid stock ticker symbol</p>
      </div>
      
      {/* Key Metrics */}
      {(stockData || isLoading) && (
        <div className="border-t border-neutral-200 pt-4 mt-4">
          <h3 className="text-lg font-medium text-[#21324F] mb-3">Key Metrics</h3>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Current Price */}
            <div className="bg-neutral-50 p-3 rounded-md">
              <p className="text-xs text-neutral-500 mb-1">Current Price</p>
              {isLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <p className="text-[#1A2942] font-semibold text-lg">
                  {stockData ? formatCurrency(stockData.price) : '-'}
                </p>
              )}
            </div>
            
            {/* EPS */}
            <div className="bg-neutral-50 p-3 rounded-md">
              <p className="text-xs text-neutral-500 mb-1">EPS (TTM)</p>
              {isLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <p className="text-[#1A2942] font-semibold text-lg">
                  {stockData ? formatCurrency(stockData.eps) : '-'}
                </p>
              )}
            </div>
            
            {/* P/E Ratio */}
            <div className="bg-neutral-50 p-3 rounded-md">
              <p className="text-xs text-neutral-500 mb-1">P/E Ratio</p>
              {isLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <p className="text-[#1A2942] font-semibold text-lg">
                  {stockData ? stockData.peRatio.toFixed(1) : '-'}
                </p>
              )}
            </div>
            
            {/* FCF per Share */}
            <div className="bg-neutral-50 p-3 rounded-md">
              <p className="text-xs text-neutral-500 mb-1">FCF per Share</p>
              {isLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <p className="text-[#1A2942] font-semibold text-lg">
                  {stockData ? formatCurrency(stockData.fcfPerShare) : '-'}
                </p>
              )}
            </div>
            
            {/* Growth Rate */}
            <div className="bg-neutral-50 p-3 rounded-md">
              <p className="text-xs text-neutral-500 mb-1">Growth Rate (5Y)</p>
              {isLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <p className="text-[#1A2942] font-semibold text-lg">
                  {stockData ? `${stockData.growthRate}%` : '-'}
                </p>
              )}
            </div>
            
            {/* ROE */}
            <div className="bg-neutral-50 p-3 rounded-md">
              <p className="text-xs text-neutral-500 mb-1">ROE</p>
              {isLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <p className="text-[#1A2942] font-semibold text-lg">
                  {stockData ? `${stockData.roe.toFixed(1)}%` : '-'}
                </p>
              )}
            </div>
          </div>
          
          {/* Quality Assessment */}
          {stockData && companyQuality && (
            <div className="mt-5 bg-[#E9ECF1] p-4 rounded-md border border-[#C4CCD9]">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-[#21324F]">Company Quality</h4>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getQualityColorClass(companyQuality)}`}>
                  {companyQuality}
                </span>
              </div>
              <p className="text-sm text-neutral-600">Based on financial strength, competitive position, and historical performance</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StockInformation;
