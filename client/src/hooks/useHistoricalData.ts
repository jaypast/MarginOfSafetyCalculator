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
      
      // Ensure we have a valid array to work with
      const rawData = Array.isArray(data.data) ? data.data : [];
      console.log(`Raw data length for ${symbol}: ${rawData.length} points`);
      
      // Step 1: Filter out undefined or null points
      const nonNullPoints = rawData.filter(point => point !== null && point !== undefined);
      
      // Step 2: Filter points with valid date and close price
      const validData = nonNullPoints.filter(point => {
        if (!point || typeof point !== 'object') {
          console.warn('Invalid point (not an object):', point);
          return false;
        }
        
        // Check if date is valid
        const hasValidDate = typeof point.date === 'string' && point.date.trim() !== '';
        
        // Check if close price is valid
        const hasValidClose = typeof point.close === 'number' && !isNaN(point.close);
        
        if (!hasValidDate) console.warn('Point missing valid date:', point);
        if (!hasValidClose) console.warn('Point missing valid close price:', point);
        
        return hasValidDate && hasValidClose;
      });
      
      if (validData.length < rawData.length) {
        console.warn(`Filtered out ${rawData.length - validData.length} invalid data points for ${symbol}`);
      }
      
      // Step 3: Fix any future dates by ensuring they are not after today
      const today = new Date();
      const fixedDates = validData.filter(point => {
        try {
          const pointDate = new Date(point.date);
          if (isNaN(pointDate.getTime())) {
            console.warn(`Invalid date format: ${point.date}`);
            return false;
          }
          
          // Check if date is in the future
          const isValid = pointDate <= today;
          if (!isValid) {
            console.warn(`Removed future date for ${symbol}: ${point.date}`);
          }
          return isValid;
        } catch (e) {
          console.warn(`Error processing date: ${point.date}`, e);
          return false;
        }
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
    retry: 2, // Increased retries to handle occasional API failures
    select: (data) => {
      if (data.length === 0) {
        console.warn(`No data points available for ${symbol} (${period})`);
      } else if (data.length < 5) {
        console.warn(`Limited data points (${data.length}) available for ${symbol} (${period})`);
      } else {
        console.log(`Successfully processed ${data.length} data points for ${symbol} (${period}): ${data[0].date} to ${data[data.length-1].date}`);
      }
      return data;
    }
  });
}