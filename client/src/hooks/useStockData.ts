import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { StockData } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export const useStockData = () => {
  const [symbol, setSymbol] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query to fetch stock data with optimized settings
  const stockDataQuery = useQuery({
    queryKey: [`/api/stock/${symbol}`],
    enabled: symbol.length > 0,
    retry: 1,
    gcTime: 10 * 60 * 1000, // 10 minutes
    staleTime: 3 * 60 * 1000, // Consider data fresh for 3 minutes
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  });

  // Mutation to fetch stock data with efficient caching
  const fetchStockDataMutation = useMutation({
    mutationFn: async (newSymbol: string) => {
      // Normalize symbol to uppercase
      const normalizedSymbol = newSymbol.toUpperCase();
      setSymbol(normalizedSymbol);
      
      // Check cache first
      const cachedData = queryClient.getQueryData([`/api/stock/${normalizedSymbol}`]) as StockData | undefined;
      if (cachedData) {
        console.log(`Using cached data for ${normalizedSymbol}`);
        return cachedData;
      }
      
      // Fetch fresh data if not in cache
      const res = await apiRequest('GET', `/api/stock/${normalizedSymbol}`, undefined);
      return res.json() as Promise<StockData>;
    },
    onSuccess: (data) => {
      // Only show toast if there's no error
      if (!data.error) {
        toast({
          title: "Data retrieved successfully",
          description: `Stock data for ${data.symbol} has been loaded.`,
        });
      }
      
      // Update query cache
      queryClient.setQueryData([`/api/stock/${data.symbol}`], data);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to fetch stock data",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Memoized fetch function to prevent unnecessary re-renders
  const fetchStockData = useCallback((symbol: string) => {
    if (!symbol || symbol.trim() === '') {
      toast({
        title: "Symbol required",
        description: "Please enter a valid stock symbol.",
        variant: "destructive",
      });
      return;
    }
    
    fetchStockDataMutation.mutate(symbol);
  }, [toast, fetchStockDataMutation]);

  return {
    stockData: stockDataQuery.data as StockData | undefined,
    isLoading: stockDataQuery.isLoading || fetchStockDataMutation.isPending,
    isError: stockDataQuery.isError,
    error: stockDataQuery.error,
    fetchStockData,
  };
};
