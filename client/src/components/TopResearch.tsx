import React, { useState, useEffect } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { formatCurrency } from '@/lib/utils';
import { computeStockQuality, StockQuality } from '@/lib/researchCalculations';

// Simple research stock interface
interface ResearchStock {
  symbol: string;
  name: string;
  price: number;
  quality: StockQuality;
}

const TopResearch = () => {
  const [stockRecommendations, setStockRecommendations] = useState<ResearchStock[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toISOString());

  // Format the last updated date for display
  const formatLastUpdated = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Function to fetch stock data
  const fetchStockData = async (symbol: string) => {
    try {
      const response = await fetch(`/api/stock/${symbol}`);
      if (!response.ok) {
        console.warn(`Failed to fetch data for ${symbol}`);
        return null;
      }
      
      const data = await response.json();
      
      if (data.error) {
        console.warn(`Error in data for ${symbol}: ${data.errorMessage}`);
        return null;
      }
      
      const quality = computeStockQuality(data);

      return {
        symbol: data.symbol,
        name: data.name,
        price: data.price,
        quality
      };
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
      return null;
    }
  };

  // Function to fetch all stock data
  const fetchTopStocks = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Set of high-quality companies to analyze
      const stockSymbols = ['AAPL', 'MSFT', 'GOOG', 'AMZN', 'NVDA', 'BRK-B', 'META', 'TSM', 'V', 'JNJ'];
      
      // Fetch data for all stocks
      const promises = stockSymbols.map(symbol => fetchStockData(symbol));
      const results = await Promise.all(promises);
      
      // Filter out null results and sort by quality (Exceptional first, then Good)
      const validStocks = results
        .filter((stock): stock is ResearchStock => stock !== null)
        .sort((a, b) => {
          // Primary sort by quality
          const qualityOrder = { 'Exceptional': 0, 'Good': 1, 'Average': 2, 'Speculative': 3 };
          return qualityOrder[a.quality] - qualityOrder[b.quality];
        });
      
      // Update state
      setStockRecommendations(validStocks);
      setLastUpdated(new Date().toISOString());
      setIsLoading(false);
    } catch (err) {
      console.error("Error fetching top stocks:", err);
      setError("Failed to load research ideas. Please try again later.");
      setIsLoading(false);
    }
  };

  // Initialize on component mount
  useEffect(() => {
    fetchTopStocks();
  }, []);

  // Toggle expanded state
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Quality badge color
  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'Exceptional':
        return 'bg-blue-100 text-blue-800';
      case 'Good':
        return 'bg-green-100 text-green-800';
      case 'Average':
        return 'bg-yellow-100 text-yellow-800';
      case 'Speculative':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className="bg-white rounded-lg shadow-sm border border-neutral-200 mb-6">
      <div className="flex justify-between items-center p-4 border-b border-neutral-200">
        <h2 
          className="text-xl font-semibold text-[#1A2942] cursor-pointer" 
          onClick={toggleExpanded}
        >
          Top Research Ideas
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center text-xs text-gray-500 mr-2">
            <Calendar size={12} className="mr-1" />
            <span>Updated: {formatLastUpdated(lastUpdated)}</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 p-0" 
            aria-label="Toggle research"
            onClick={toggleExpanded}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </Button>
        </div>
      </div>
      
      {isExpanded && (
        <CardContent className="p-4">
          {isLoading ? (
            // Skeleton loader
            <div className="space-y-2">
              <div className="flex space-x-4">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-4 w-[80px]" />
              </div>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <Skeleton className="h-4 w-[140px]" />
                  <Skeleton className="h-4 w-[70px]" />
                  <Skeleton className="h-4 w-[70px]" />
                </div>
              ))}
            </div>
          ) : error ? (
            // Error state
            <div className="text-center py-8 text-red-500">
              <p>{error}</p>
              <p className="text-sm text-gray-500 mt-2">Please try again later</p>
            </div>
          ) : (
            // Data table
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-left">Company</TableHead>
                        <TableHead className="text-right">Current Price</TableHead>
                        <TableHead className="text-right">Quality</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockRecommendations.map((stock, index) => (
                        <TableRow key={index} className="hover:bg-gray-50">
                          <TableCell className="text-neutral-800">
                            <div>
                              <span className="font-medium">{stock.name}</span>
                              <span className="text-xs text-gray-500 ml-2">({stock.symbol})</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(stock.price)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getQualityColor(stock.quality)}`}>
                              {stock.quality}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
          
          <div className="mt-4 text-sm text-gray-700">
            <p className="mb-2">These are the highest quality companies based on financial metrics including return on equity, debt levels, and current ratio. Quality companies are typically worth investing in at the right price.</p>
            <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
              <p className="text-xs text-blue-700 font-medium mb-1">INVESTMENT ADVICE DISCLAIMER</p>
              <p className="text-xs text-blue-700">This information is provided for educational purposes only and should not be considered investment advice. Always conduct your own research and consider consulting with a financial advisor before making investment decisions.</p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default TopResearch;