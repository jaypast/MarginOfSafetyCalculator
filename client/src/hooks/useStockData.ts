import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { StockData } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export const useStockData = () => {
  const [symbol, setSymbol] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query to fetch stock data with improved caching
  const stockDataQuery = useQuery<StockData>({
    queryKey: ['/api/stock', symbol],
    queryFn: async () => {
      if (!symbol) return null as any;
      const res = await apiRequest('GET', `/api/stock/${symbol}`, undefined);
      return res.json();
    },
    enabled: symbol.length > 0,
    retry: 1,
    gcTime: 15 * 60 * 1000, // 15 minutes - keep in cache longer
    staleTime: 2 * 60 * 1000, // 2 minutes - data considered fresh for longer
  });

  // Mutation to fetch stock data
  const fetchStockDataMutation = useMutation({
    mutationFn: async (newSymbol: string) => {
      const uppercaseSymbol = newSymbol.toUpperCase();
      
      // Check if data is already in the cache and not stale
      const existingData = queryClient.getQueryData<StockData>(['/api/stock', uppercaseSymbol]);
      const queryState = queryClient.getQueryState<StockData>(['/api/stock', uppercaseSymbol]);
      
      // Only fetch new data if not in cache or if data is stale
      if (!existingData || (queryState && queryState.dataUpdateCount === 0) || (queryState && queryState.isStale)) {
        // Set symbol before the fetch to trigger the query
        setSymbol(uppercaseSymbol);
        const res = await apiRequest('GET', `/api/stock/${uppercaseSymbol}`, undefined);
        return res.json() as Promise<StockData>;
      }
      
      // Set symbol to trigger the query to use cached data
      setSymbol(uppercaseSymbol);
      return existingData;
    },
    onSuccess: (data) => {
      if (!data) return;
      
      // Prefetch historical data for better UX
      queryClient.prefetchQuery({
        queryKey: [`/api/stock/${data.symbol}/history`, '5y', '1mo'],
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
      
      toast({
        title: "Data retrieved successfully",
        description: `Stock data for ${data.symbol} has been loaded.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to fetch stock data",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const fetchStockData = (newSymbol: string) => {
    if (!newSymbol || newSymbol.trim() === '') {
      toast({
        title: "Symbol required",
        description: "Please enter a valid stock symbol.",
        variant: "destructive",
      });
      return;
    }
    
    // Attempt to fetch data, with cache-aware logic
    fetchStockDataMutation.mutate(newSymbol);
  };

  return {
    stockData: stockDataQuery.data,
    symbol: symbol,
    isLoading: stockDataQuery.isLoading || fetchStockDataMutation.isPending,
    isError: stockDataQuery.isError,
    error: stockDataQuery.error,
    fetchStockData,
  };
};
