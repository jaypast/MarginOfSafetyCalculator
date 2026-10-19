import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { StockData } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

class StockLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StockLookupError';
  }
}

async function loadStockData(symbol: string): Promise<StockData> {
  const res = await apiRequest('GET', `/api/stock/${symbol}`, undefined);
  const data = await res.json() as StockData;
  const hasPrice = Number.isFinite(data.price) && data.price > 0;
  const hasEarningsOrCashFlow =
    (Number.isFinite(data.eps) && data.eps !== 0) ||
    (Number.isFinite(data.fcfPerShare) && data.fcfPerShare !== 0);
  if (data.error || !hasPrice || !hasEarningsOrCashFlow) {
    throw new StockLookupError(
      data.errorMessage || `Market data for "${symbol}" is temporarily unavailable. Please try again shortly.`,
    );
  }
  return data;
}

export const useStockData = () => {
  const [symbol, setSymbol] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const retryLookupRef = useRef<(symbol: string) => void>(() => undefined);

  // Query to fetch stock data with improved caching
  const stockDataQuery = useQuery<StockData>({
    queryKey: ['/api/stock', symbol],
    queryFn: async () => {
      if (!symbol) return null as any;
      return loadStockData(symbol);
    },
    // The mutation below owns the request; this query only subscribes to its
    // cached result so a symbol change cannot start a duplicate provider call.
    enabled: false,
    retry: false,
    gcTime: 15 * 60 * 1000, // 15 minutes - keep in cache longer
    staleTime: 2 * 60 * 1000, // 2 minutes - data considered fresh for longer
  });

  const fetchStockDataMutation = useMutation<
    StockData,
    Error,
    { symbol: string; forceRefresh?: boolean }
  >({
    mutationFn: async ({ symbol: newSymbol, forceRefresh = false }: { symbol: string; forceRefresh?: boolean }) => {
      const uppercaseSymbol = newSymbol.toUpperCase();
      setSymbol(uppercaseSymbol);
      return queryClient.fetchQuery({
        queryKey: ['/api/stock', uppercaseSymbol],
        queryFn: () => loadStockData(uppercaseSymbol),
        staleTime: forceRefresh ? 0 : 2 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        retry: false,
      });
    },
    retry: false,
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
        duration: 3000,
      });
    },
    onError: (error: Error, variables) => {
      const uppercaseSymbol = variables.symbol.toUpperCase();
      toast({
        title: error instanceof StockLookupError ? "Market data temporarily unavailable" : "Could not load stock data",
        description: error.message || `Market data for "${uppercaseSymbol}" could not be loaded. Please try again.`,
        variant: "destructive",
        duration: 10000,
        action: React.createElement(
          ToastAction,
          {
            altText: `Retry loading ${uppercaseSymbol}`,
            onClick: () => retryLookupRef.current(uppercaseSymbol),
          },
          'Retry',
        ) as unknown as React.ReactElement<typeof ToastAction>,
      });
    }
  });
  retryLookupRef.current = (retrySymbol) => {
    fetchStockDataMutation.mutate({ symbol: retrySymbol, forceRefresh: true });
  };

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
    fetchStockDataMutation.mutate({ symbol: newSymbol.trim() });
  };

  return {
    stockData: stockDataQuery.data?.error ? undefined : stockDataQuery.data,
    symbol: symbol,
    isLoading: stockDataQuery.isFetching || fetchStockDataMutation.isPending,
    isError: stockDataQuery.isError || fetchStockDataMutation.isError,
    error: stockDataQuery.error ?? fetchStockDataMutation.error,
    fetchStockData,
  };
};
