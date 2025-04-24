import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronDown, ChevronUp, BarChart2, AlertCircle } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { useHistoricalData, type HistoricalDataPoint } from '@/hooks/useHistoricalData';

interface StockPriceChartProps {
  symbol: string;
  currentPrice: number;
  companyName: string;
}

const StockPriceChart = ({ symbol, currentPrice, companyName }: StockPriceChartProps) => {
  const [period, setPeriod] = useState<'5y' | '2y' | '1y'>('2y');
  
  // Use our custom hook for fetching and caching historical data
  const { 
    data: historicalData = [], 
    isLoading, 
    error: queryError,
    isError 
  } = useHistoricalData(symbol, period, '1mo');
  
  // Format the price for display
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  };

  // Calculate the percentage change from the first data point to current price
  const calculateChange = () => {
    // Make absolutely sure we have valid data before attempting calculations
    if (!historicalData || !Array.isArray(historicalData) || historicalData.length === 0 || 
        typeof historicalData[0]?.close !== 'number') {
      return { 
        value: 0, 
        percentage: 0, 
        isPositive: true 
      };
    }
    
    const firstPrice = historicalData[0].close;
    const change = currentPrice - firstPrice;
    const percentageChange = (change / firstPrice) * 100;
    
    return { 
      value: change, 
      percentage: percentageChange,
      isPositive: change >= 0
    };
  };

  // Format date for chart tooltip
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded shadow text-sm">
          <p className="font-medium">{formatDate(label)}</p>
          <p className="text-[#1A2942]">
            <span className="font-medium">Close:</span> {formatPrice(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  // Calculate price change
  const priceChange = calculateChange();

  return (
    <Card className="mb-6 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium text-[#21324F] flex justify-between items-center">
          <div className="flex items-center">
            <BarChart2 className="mr-2 h-5 w-5 text-[#436280]" />
            {period === '5y' ? '5-Year' : period === '2y' ? '2-Year' : '1-Year'} Price History
          </div>
          <div className="flex space-x-2 text-sm">
            <button 
              onClick={() => setPeriod('1y')}
              className={`px-2 py-1 rounded ${period === '1y' ? 'bg-[#E9ECF1] font-medium' : 'hover:bg-gray-100'}`}
            >
              1Y
            </button>
            <button 
              onClick={() => setPeriod('2y')}
              className={`px-2 py-1 rounded ${period === '2y' ? 'bg-[#E9ECF1] font-medium' : 'hover:bg-gray-100'}`}
            >
              2Y
            </button>
            <button 
              onClick={() => setPeriod('5y')}
              className={`px-2 py-1 rounded ${period === '5y' ? 'bg-[#E9ECF1] font-medium' : 'hover:bg-gray-100'}`}
            >
              5Y
            </button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[250px] w-full rounded-md" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-[250px] bg-gray-50 rounded-md">
            <div className="text-center text-gray-500">
              <AlertCircle className="mx-auto h-10 w-10 text-gray-400 mb-2" />
              <p>{queryError instanceof Error ? queryError.message : 'Failed to load historical data'}</p>
              <p className="text-sm mt-1">Historical data may not be available for this stock.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-[#5A6E85]">{companyName} ({symbol})</p>
                <p className="text-xl font-bold text-[#1A2942]">{formatPrice(currentPrice)}</p>
              </div>
              {historicalData.length > 0 && (
                <div className={`flex items-center ${priceChange.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                  {priceChange.isPositive ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                  <div>
                    <p className="font-medium">{formatPrice(Math.abs(priceChange.value))}</p>
                    <p className="text-xs">{priceChange.percentage.toFixed(2)}% over {period}</p>
                  </div>
                </div>
              )}
            </div>
            
            {historicalData.length > 0 ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={historicalData}
                    margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E9ECF1" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(tick) => {
                        if (!tick) return '';
                        const date = new Date(tick);
                        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                      }}
                      stroke="#9AA5B8"
                      fontSize={12}
                    />
                    <YAxis 
                      domain={['auto', 'auto']}
                      tickFormatter={(tick) => formatPrice(tick)}
                      stroke="#9AA5B8"
                      fontSize={12}
                      width={80}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="close" 
                      stroke={priceChange.isPositive ? "#22C55E" : "#EF4444"} 
                      fill={priceChange.isPositive ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)"} 
                      activeDot={{ r: 6 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[250px] bg-gray-50 rounded-md">
                <div className="text-center text-gray-500">
                  <p>No historical data available to display</p>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default StockPriceChart;