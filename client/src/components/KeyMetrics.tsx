import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { StockData } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface KeyMetricsProps {
  stockData: StockData | undefined;
  isLoading: boolean;
  companyQuality?: 'Exceptional' | 'Good' | 'Average' | 'Speculative';
}

const getQualityColorClass = (quality?: string) => {
  switch (quality) {
    case 'Exceptional':
      return 'bg-green-100 text-green-800';
    case 'Good':
      return 'bg-blue-100 text-blue-800';
    case 'Average':
      return 'bg-yellow-100 text-yellow-800';
    case 'Speculative':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-neutral-100 text-neutral-800';
  }
};

const KeyMetrics: React.FC<KeyMetricsProps> = ({ 
  stockData, 
  isLoading,
  companyQuality
}) => {
  if (!stockData && !isLoading) return null;
  
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 border border-neutral-200">
      <div className="flex flex-col mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-[#1A2942]">
          Key Metrics {stockData && <span className="text-sm font-normal">- {stockData.name}</span>}
        </h2>
        {stockData?.lastUpdated && (
          <div className="text-xs text-neutral-500 mt-1">
            Data as of: {stockData.lastUpdated}
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
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
              {stockData ? `${stockData.growthRate.toFixed(2)}%` : '-'}
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
  );
};

export default KeyMetrics;