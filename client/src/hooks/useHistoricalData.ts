import { useQuery } from '@tanstack/react-query';

export interface HistoricalDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoricalDataResponse {
  symbol: string;
  period: string;
  interval: string;
  data: HistoricalDataPoint[];
  error?: string;
  message?: string;
}

export function useHistoricalData(symbol: string, period: '5y' | '2y' | '1y' = '5y', interval: string = '1mo') {
  const fetchHistoricalData = async (): Promise<HistoricalDataPoint[]> => {
    if (!symbol) return [];
    
    const response = await fetch(`/api/stock/${symbol}/history?period=${period}&interval=${interval}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch historical data');
    }
    
    const data: HistoricalDataResponse = await response.json();
    
    if (data.error) {
      throw new Error(data.message || 'Error fetching historical data');
    }
    
    // Sort data chronologically
    return [...data.data].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  };

  return useQuery({
    queryKey: [`/api/stock/${symbol}/history`, period, interval],
    queryFn: fetchHistoricalData,
    enabled: !!symbol,
    staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh longer
    gcTime: 30 * 60 * 1000,   // 30 minutes - keep in cache longer
    retry: 1,
  });
}