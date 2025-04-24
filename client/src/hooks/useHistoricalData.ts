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
      if (!symbol) {
        console.warn('Cannot fetch historical data: symbol is empty');
        return [];
      }
      
      console.log(`Fetching historical data for ${symbol} (${period})...`);
      
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
        console.warn(`No historical data array available for ${symbol}`);
        return [];
      }
      
      console.log(`Raw historical data for ${symbol} (${period}):`, data.data.slice(0, 3), `... [${data.data.length} total points]`);
      
      // Filter out any invalid data points
      const validData = data.data.filter(point => {
        const isValid = point && 
          typeof point.date === 'string' && 
          typeof point.close === 'number' && 
          !isNaN(point.close);
        
        if (!isValid) {
          console.warn('Invalid data point:', point);
        }
        
        return isValid;
      });
      
      if (validData.length < data.data.length) {
        console.warn(`Filtered out ${data.data.length - validData.length} invalid data points`);
      }
      
      // Fix any future dates by ensuring they are not after today
      const today = new Date();
      const fixedDates = validData.filter(point => {
        const pointDate = new Date(point.date);
        const isValid = pointDate <= today;
        if (!isValid) {
          console.warn(`Removed future date: ${point.date}`);
        }
        return isValid;
      });
      
      // Sort data chronologically
      const sortedData = [...fixedDates].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      console.log(`Processed historical data for ${symbol} (${period}):`, 
        sortedData.length > 0 ? 
          `${sortedData.length} points from ${sortedData[0].date} to ${sortedData[sortedData.length-1].date}` : 
          'No data points available'
      );
      
      if (sortedData.length === 0) {
        console.warn(`Historical data for ${symbol} (${period}) is empty after validation`);
      }
      
      return sortedData;
    } catch (error) {
      console.error('Error in fetchHistoricalData:', error);
      return [];
    }
  };

  // Add logging for the entire query lifecycle
  return useQuery({
    queryKey: [`/api/stock/${symbol}/history`, period, interval],
    queryFn: fetchHistoricalData,
    enabled: !!symbol,
    staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh longer
    gcTime: 30 * 60 * 1000,   // 30 minutes - keep in cache longer
    retry: 1,
    select: (data) => {
      console.log(`Processed historical data for ${symbol} (${period}):`, data);
      if (data.length === 0) {
        console.warn(`No data points available for ${symbol}`);
      }
      return data;
    }
  });
}