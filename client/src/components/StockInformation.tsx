import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StockData } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { popularStocks } from '@/lib/stockSymbols';

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
  const [inputValue, setInputValue] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Find suggestion as user types
  useEffect(() => {
    if (inputValue) {
      const upperValue = inputValue.toUpperCase();
      // Find first matching stock that starts with the current input
      const matchingStock = popularStocks.find(stock => 
        stock.symbol.startsWith(upperValue)
      );
      
      // Set suggestion to the complete symbol if found
      if (matchingStock) {
        setSuggestion(matchingStock.symbol);
      } else {
        setSuggestion('');
      }
    } else {
      setSuggestion('');
    }
  }, [inputValue]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setInputValue(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (inputValue) {
        onFetchData(inputValue);
      }
    } else if (e.key === 'Tab' && suggestion && suggestion !== inputValue) {
      e.preventDefault();
      setInputValue(suggestion);
      // Position cursor at the end
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = suggestion.length;
          inputRef.current.selectionEnd = suggestion.length;
        }
      }, 0);
    } else if (e.key === 'ArrowRight' && suggestion && suggestion !== inputValue) {
      // Complete suggestion with arrow right
      setInputValue(suggestion);
      e.preventDefault();
    }
  };

  const handleFetchData = () => {
    if (inputValue) {
      onFetchData(inputValue);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-neutral-200">
      <h2 className="text-xl font-semibold text-[#1A2942] mb-4">Stock Information</h2>
      
      {/* Stock Symbol Input */}
      <div>
        <label htmlFor="stockSymbol" className="block text-sm font-medium text-neutral-700 mb-2">Stock Symbol</label>
        <div className="relative flex">
          <div className="relative flex-grow">
            <Input
              ref={inputRef}
              id="stockSymbol"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="pr-4 w-full"
              placeholder="e.g. AAPL"
            />
            {suggestion && suggestion !== inputValue && (
              <div className="absolute inset-0 flex items-center pointer-events-none">
                <span className="pl-3">
                  <span className="text-black">{inputValue}</span>
                  <span className="text-gray-400">
                    {suggestion.slice(inputValue.length)}
                  </span>
                </span>
              </div>
            )}
          </div>
          <Button
            onClick={handleFetchData}
            disabled={isLoading}
            className="ml-2 bg-[#21324F] hover:bg-[#1A2942] text-white font-medium"
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
        <p className="mt-2 text-sm text-neutral-500">
          Enter US ticker (AAPL) or international: BP.L, 7203.T, 0700.HK.
        </p>
        
        {/* Error Message */}
        {(error || (stockData && stockData.error)) && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">
              {errorMessage || (stockData && stockData.errorMessage) || "Could not find the stock. Please check your input and try again."}
            </p>
            <div className="text-xs text-neutral-600 mt-1">
              <strong>Tips:</strong> 
              <ul className="list-disc pl-5 mt-1">
                <li>Try using the exact ticker symbol (e.g., 'AAPL' for Apple)</li>
                <li>For European stocks, add the exchange suffix (e.g., 'BP.L' for BP on London Exchange)</li>
                <li>For Japanese stocks, add '.T' suffix (e.g., '7203.T' for Toyota, '9984.T' for SoftBank)</li>
                <li>For Hong Kong stocks, add '.HK' suffix (e.g., '0700.HK' for Tencent, '9988.HK' for Alibaba)</li>
              </ul>
            </div>
          </div>
        )}
        
        {/* Stock Details Info */}
        {stockData && !stockData.error && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">
              Successfully found stock: <strong>{stockData.name} ({stockData.symbol})</strong>
            </p>
            <p className="text-xs text-neutral-600 mt-1">
              Current Price: <strong>{formatCurrency(stockData.price)}</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockInformation;