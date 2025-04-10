import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StockData } from '@/lib/types';

interface StockInformationProps {
  stockData: StockData | undefined;
  isLoading: boolean;
  onFetchData: (symbol: string) => void;
  error?: boolean;
  errorMessage?: string;
}

const StockInformation: React.FC<StockInformationProps> = ({ 
  stockData,
  isLoading, 
  onFetchData,
  error,
  errorMessage
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

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-neutral-200">
      <h2 className="text-xl font-semibold text-[#1A2942] mb-4">Stock Information</h2>
      
      {/* Stock Symbol Input */}
      <div>
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
                <i className="ri-search-line mr-1"></i> Find
              </span>
            )}
          </Button>
        </div>
        <p className="mt-2 text-sm text-neutral-500">Enter a valid stock ticker symbol</p>
        
        {/* Error Message */}
        {(error || (stockData && stockData.error)) && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">
              {errorMessage || (stockData && stockData.errorMessage) || "Could not find the stock. Please check your input and try again."}
            </p>
            <p className="text-xs text-neutral-600 mt-1">
              <strong>Tips:</strong> 
              <ul className="list-disc pl-5 mt-1">
                <li>Try using the exact ticker symbol (e.g., 'AAPL' for Apple)</li>
                <li>For European stocks, try adding the exchange suffix (e.g., 'BP.L' for BP on London Exchange)</li>
              </ul>
            </p>
          </div>
        )}
        
        {/* Stock Details Info */}
        {stockData && !stockData.error && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">
              Successfully found stock: <strong>{stockData.name} ({stockData.symbol})</strong>
            </p>
            <p className="text-xs text-neutral-600 mt-1">
              Current Price: <strong>${stockData.price.toFixed(2)}</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockInformation;
