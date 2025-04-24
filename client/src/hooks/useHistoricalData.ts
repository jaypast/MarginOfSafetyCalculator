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
    try {
      if (!symbol) return [];
      
      const response = await fetch(`/api/stock/${symbol}/history?period=${period}&interval=${interval}`);
      
      if (!response.ok) {
        console.error(`Failed to fetch historical data: ${response.statusText}`);
        return [];
      }
      
      const data: HistoricalDataResponse = await response.json();
      
      if (data.error) {
        console.error(`Error in historical data response: ${data.message || 'Unknown error'}`);
        return [];
      }
      
      if (!data.data || !Array.isArray(data.data)) {
        console.warn(`No historical data available for ${symbol}`);
        return [];
      }
      
      // Filter out any invalid data points
      const validData = data.data.filter(point => 
        point && 
        typeof point.date === 'string' && 
        typeof point.close === 'number' && 
        !isNaN(point.close)
      );
      
      // Sort data chronologically
      const sortedData = [...validData].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      console.log(`Historical data for ${symbol} (${period}):`, sortedData);
      
      if (sortedData.length === 0) {
        console.warn(`Historical data for ${symbol} (${period}) is empty after validation`);
      }
      
      return sortedData;
    } catch (error) {
      console.error('Error in fetchHistoricalData:', error);
      return [];
    }
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