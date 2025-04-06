import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StockData } from '@/lib/types';

interface StockInformationProps {
  stockData: StockData | undefined;
  isLoading: boolean;
  onFetchData: (symbol: string) => void;
}

const StockInformation: React.FC<StockInformationProps> = ({ 
  isLoading, 
  onFetchData
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
      </div>
    </div>
  );
};

export default StockInformation;
