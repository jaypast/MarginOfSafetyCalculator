import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { StockData } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export const useStockData = () => {
  const [symbol, setSymbol] = useState<string>('');
  const { toast } = useToast();

  // Query to fetch stock data
  const stockDataQuery = useQuery({
    queryKey: [`/api/stock/${symbol}`],
    enabled: symbol.length > 0,
    retry: 1,
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation to fetch stock data
  const fetchStockDataMutation = useMutation({
    mutationFn: async (newSymbol: string) => {
      setSymbol(newSymbol);
      const res = await apiRequest('GET', `/api/stock/${newSymbol}`, undefined);
      return res.json() as Promise<StockData>;
    },
    onSuccess: (data) => {
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

  const fetchStockData = (symbol: string) => {
    if (!symbol || symbol.trim() === '') {
      toast({
        title: "Symbol required",
        description: "Please enter a valid stock symbol.",
        variant: "destructive",
      });
      return;
    }
    
    fetchStockDataMutation.mutate(symbol.toUpperCase());
  };

  return {
    stockData: stockDataQuery.data as StockData | undefined,
    isLoading: stockDataQuery.isLoading || fetchStockDataMutation.isPending,
    isError: stockDataQuery.isError,
    error: stockDataQuery.error,
    fetchStockData,
  };
};
