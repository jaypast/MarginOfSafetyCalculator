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

// Define the stock recommendation type
interface ResearchStock {
  symbol: string;
  name: string;
  price: number;
  intrinsicValue: number;
  buyBelowPrice: number;
  qualityBuyPrice: number;
  discount: number;
  quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative';
}

const TopResearch = () => {
  const [stockRecommendations, setStockRecommendations] = useState<ResearchStock[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Format the last updated date for display
  const formatLastUpdated = (dateString: string | null) => {
    if (!dateString) return "Never";
    
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Function to fetch stock data with caching
  const fetchTopStocks = async () => {
    setIsLoading(true);    
    setError(null);
    
    try {
      let cachedData = null;
      let lastUpdatedStr = null;
      const currentDate = new Date();
      
      // Safely try to access localStorage
      try {
        cachedData = localStorage.getItem('topStockRecommendations');
        lastUpdatedStr = localStorage.getItem('topStockRecommendationsUpdated');
      } catch (storageError) {
        console.warn("LocalStorage is not available:", storageError);
      }
      
      // Parse the last updated date
      const lastUpdatedDate = lastUpdatedStr ? new Date(lastUpdatedStr) : null;
      
      // Set the last updated date to display in the UI
      setLastUpdated(lastUpdatedStr || currentDate.toISOString());
      
      // Calculate if a week has passed since last update
      const needsRefresh = !lastUpdatedDate || 
        (currentDate.getTime() - lastUpdatedDate.getTime()) > 7 * 24 * 60 * 60 * 1000;
      
      // If we have cached data and it's less than a week old, use it
      if (cachedData && !needsRefresh) {
        try {
          setStockRecommendations(JSON.parse(cachedData));
          setIsLoading(false);
          return;
        } catch (parseError) {
          console.warn("Error parsing cached data:", parseError);
        }
      }
      
      // In a real implementation, this would make an API call
      // For now, we'll use sample data since the backend API isn't implemented yet
      // This simulates an API call with a slight delay
      setTimeout(() => {
        // Get sample data from our helper function
        const sampleStocks: ResearchStock[] = getFullSampleStocks();
        
        // Try to cache the results and update timestamp
        try {
          localStorage.setItem('topStockRecommendations', JSON.stringify(sampleStocks));
          localStorage.setItem('topStockRecommendationsUpdated', currentDate.toISOString());
        } catch (storageError) {
          console.warn("Could not save to localStorage:", storageError);
        }
        
        setStockRecommendations(sampleStocks);
        setIsLoading(false);
      }, 800);
      
    } catch (err) {
      console.error("Error in fetchTopStocks:", err);
      
      // If there's an error, try to use cached data if available
      try {
        const cachedData = localStorage.getItem('topStockRecommendations');
        if (cachedData) {
          setStockRecommendations(JSON.parse(cachedData));
          setError("Using cached data. Could not refresh recommendations.");
        } else {
          // Always set some data even if localStorage fails
          const fallbackStocks = getSampleStocks();
          setStockRecommendations(fallbackStocks);
        }
      } catch (storageError) {
        // If localStorage access fails, use the fallback data
        const fallbackStocks = getSampleStocks();
        setStockRecommendations(fallbackStocks);
        setError("Could not access cached data. Using sample data.");
      }
      
      setIsLoading(false);
    }
  };
  
  // Helper function to get sample stocks data (short version)
  const getSampleStocks = (): ResearchStock[] => {
    return [
      { 
        symbol: "AAPL", 
        name: "Apple Inc.", 
        price: 169.58, 
        intrinsicValue: 210.25, 
        buyBelowPrice: 178.71, 
        qualityBuyPrice: 168.20, 
        discount: 19.34,
        quality: 'Exceptional'
      },
      { 
        symbol: "MSFT", 
        name: "Microsoft Corporation", 
        price: 404.87, 
        intrinsicValue: 475.32, 
        buyBelowPrice: 404.02, 
        qualityBuyPrice: 380.26, 
        discount: 14.82,
        quality: 'Exceptional'
      },
      { 
        symbol: "GOOG", 
        name: "Alphabet Inc.", 
        price: 151.77, 
        intrinsicValue: 185.24, 
        buyBelowPrice: 157.45, 
        qualityBuyPrice: 148.19, 
        discount: 18.07,
        quality: 'Exceptional'
      },
      { 
        symbol: "AMZN", 
        name: "Amazon.com Inc.", 
        price: 175.35, 
        intrinsicValue: 210.42, 
        buyBelowPrice: 178.86, 
        qualityBuyPrice: 168.34, 
        discount: 16.67,
        quality: 'Good'
      },
      { 
        symbol: "NVDA", 
        name: "NVIDIA Corporation", 
        price: 870.39, 
        intrinsicValue: 950.75, 
        buyBelowPrice: 808.14, 
        qualityBuyPrice: 760.60, 
        discount: 8.45,
        quality: 'Exceptional'
      }
    ];
  };
  
  // Helper function to get full sample stocks data
  const getFullSampleStocks = (): ResearchStock[] => {
    // Start with the basic stocks
    const basicStocks = getSampleStocks();
    
    // Add more stocks for the full list
    return [
      ...basicStocks,
      { 
        symbol: "BRK-B", 
        name: "Berkshire Hathaway Inc.", 
        price: 407.13, 
        intrinsicValue: 490.45, 
        buyBelowPrice: 416.88, 
        qualityBuyPrice: 392.36, 
        discount: 17.00,
        quality: 'Exceptional'
      },
      { 
        symbol: "META", 
        name: "Meta Platforms Inc.", 
        price: 474.03, 
        intrinsicValue: 565.72, 
        buyBelowPrice: 480.86, 
        qualityBuyPrice: 452.58, 
        discount: 16.20,
        quality: 'Good'
      },
      { 
        symbol: "TSM", 
        name: "Taiwan Semiconductor", 
        price: 139.85, 
        intrinsicValue: 172.34, 
        buyBelowPrice: 146.49, 
        qualityBuyPrice: 137.87, 
        discount: 18.85,
        quality: 'Exceptional'
      },
      { 
        symbol: "V", 
        name: "Visa Inc.", 
        price: 274.52, 
        intrinsicValue: 340.25, 
        buyBelowPrice: 289.21, 
        qualityBuyPrice: 272.20, 
        discount: 19.32,
        quality: 'Exceptional'
      },
      { 
        symbol: "WMT", 
        name: "Walmart Inc.", 
        price: 59.68, 
        intrinsicValue: 70.42, 
        buyBelowPrice: 59.86, 
        qualityBuyPrice: 56.34, 
        discount: 15.25,
        quality: 'Good'
      }
    ];
  };

  // Initialize on component mount
  useEffect(() => {
    fetchTopStocks();
  }, []);

  // Handles toggling the expanded state
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

  // Discount badge color
  const getDiscountColor = (discount: number) => {
    if (discount >= 25) return 'text-green-600';
    if (discount >= 15) return 'text-green-500';
    if (discount >= 5) return 'text-amber-500';
    return 'text-gray-500';
  };

  return (
    <Card className="bg-white rounded-lg shadow-sm border border-neutral-200 mb-6">
      <div 
        className="flex justify-between items-center p-4 border-b border-neutral-200"
      >
        <h2 
          className="text-xl font-semibold text-[#1A2942] cursor-pointer" 
          onClick={toggleExpanded}
        >
          Top Research Ideas
        </h2>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <div className="flex items-center text-xs text-gray-500 mr-2">
              <Calendar size={12} className="mr-1" />
              <span>Updated: {formatLastUpdated(lastUpdated)}</span>
            </div>
          )}
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
            // Skeleton loader while loading
            <div className="space-y-2">
              <div className="flex space-x-4">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-4 w-[80px]" />
                <Skeleton className="h-4 w-[80px]" />
                <Skeleton className="h-4 w-[80px]" />
              </div>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <Skeleton className="h-4 w-[50px]" />
                  <Skeleton className="h-4 w-[140px]" />
                  <Skeleton className="h-4 w-[70px]" />
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
                        <TableHead className="text-left">Symbol</TableHead>
                        <TableHead className="text-left">Company</TableHead>
                        <TableHead className="text-right">Current Price</TableHead>
                        <TableHead className="text-right">Quality</TableHead>
                        <TableHead className="text-right">Buy Below</TableHead>
                        <TableHead className="text-right">Strong Buy</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockRecommendations.map((stock, index) => (
                        <TableRow key={index} className="hover:bg-gray-50">
                          <TableCell className="font-medium">{stock.symbol}</TableCell>
                          <TableCell className="text-neutral-800">{stock.name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(stock.price)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getQualityColor(stock.quality)}`}>
                              {stock.quality}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(stock.buyBelowPrice)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(stock.qualityBuyPrice)}</TableCell>
                          <TableCell className={`text-right font-medium ${getDiscountColor(stock.discount)}`}>
                            {stock.discount.toFixed(1)}%
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
            <p className="mb-2">This research is updated weekly based on our margin of safety analysis. Stocks are ranked by their quality and discount to intrinsic value.</p>
            <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
              <p className="text-xs text-blue-700 font-medium mb-1">DISCLAIMER</p>
              <p className="text-xs text-blue-700">This information is provided for educational purposes only and should not be considered investment advice. Always conduct your own research and consider consulting with a financial advisor before making investment decisions.</p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default TopResearch;