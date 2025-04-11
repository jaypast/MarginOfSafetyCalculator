import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StockData } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { popularStocks, searchStocks } from '@/lib/stockSymbols';
import { Check, ChevronsUpDown } from "lucide-react";

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
  const [open, setOpen] = useState(false);
  const [filteredStocks, setFilteredStocks] = useState(popularStocks.slice(0, 10));

  // Update filtered stocks when symbolInput changes
  useEffect(() => {
    if (symbolInput) {
      setFilteredStocks(searchStocks(symbolInput));
    } else {
      setFilteredStocks(popularStocks.slice(0, 10));
    }
  }, [symbolInput]);

  const handleSymbolChange = (value: string) => {
    // Convert input to uppercase automatically
    setSymbolInput(value.toUpperCase());
  };

  const handleStockSelect = (stock: { symbol: string; name: string }) => {
    setSymbolInput(stock.symbol);
    setOpen(false);
    onFetchData(stock.symbol);
  };

  const handleFetchData = () => {
    if (symbolInput) {
      onFetchData(symbolInput);
      setOpen(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-neutral-200">
      <h2 className="text-xl font-semibold text-[#1A2942] mb-4">Stock Information</h2>
      
      {/* Stock Symbol Input */}
      <div>
        <label htmlFor="stockSymbol" className="block text-sm font-medium text-neutral-700 mb-2">Stock Symbol</label>
        <div className="w-full">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <div className="flex">
                <Input
                  id="stockSymbol"
                  value={symbolInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSymbolChange(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') {
                      handleFetchData();
                    }
                  }}
                  className="rounded-r-none focus:z-10 w-full"
                  placeholder="TYPE A STOCK SYMBOL..."
                  onClick={() => setOpen(true)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoading}
                  className="px-2 rounded-l-none border-l-0"
                  onClick={() => setOpen(!open)}
                >
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
                <Button
                  onClick={handleFetchData}
                  disabled={isLoading}
                  className="ml-1 bg-[#21324F] hover:bg-[#1A2942] text-white font-medium"
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
            </PopoverTrigger>
            <PopoverContent className="p-0 w-full" align="start">
              <Command>
                <CommandInput placeholder="Search stock..." />
                <CommandEmpty>No stock found.</CommandEmpty>
                <CommandGroup>
                  {filteredStocks.map((stock) => (
                    <CommandItem
                      key={stock.symbol}
                      onSelect={() => handleStockSelect(stock)}
                      className="flex items-start"
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center">
                          <span className="font-bold mr-2">{stock.symbol}</span>
                          {stock.symbol === symbolInput && (
                            <Check className="h-4 w-4" />
                          )}
                        </div>
                        <span className="text-xs text-gray-500">{stock.name}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <p className="mt-2 text-sm text-neutral-500">Enter a valid stock ticker symbol (US, European, Japanese, Hong Kong markets supported)</p>
        
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
