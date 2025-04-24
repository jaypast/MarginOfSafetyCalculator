import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HistoricalDataPoint } from '@/hooks/useHistoricalData';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';

interface SimpleStockChartProps {
  companyName: string;
  symbol: string;
  currentPrice: number;
  historicalData: HistoricalDataPoint[];
  isLoading: boolean;
  error: any;
  period?: '5y' | '2y' | '1y';
  onPeriodChange?: (period: '5y' | '2y' | '1y') => void;
}

/**
 * A simplified stock chart component that renders historical price data
 */
const SimpleStockChart: React.FC<SimpleStockChartProps> = ({
  companyName,
  symbol,
  currentPrice,
  historicalData,
  isLoading,
  error,
  period = '5y',
  onPeriodChange = () => {}
}) => {
  // Format currency for display
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      try {
        return (
          <div className="bg-white p-3 border rounded shadow text-sm">
            <p className="font-medium">{new Date(label).toLocaleDateString()}</p>
            <p className="text-gray-800">
              <span className="font-medium">Price:</span> {formatCurrency(payload[0].value)}
            </p>
          </div>
        );
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  // Validate the data before rendering
  const hasValidData = historicalData && 
    Array.isArray(historicalData) && 
    historicalData.length >= 2;

  return (
    <Card className="w-full mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium text-gray-800">
            {period === '5y' ? '5-Year' : period === '2y' ? '2-Year' : '1-Year'} Price History - {companyName} ({symbol})
          </CardTitle>
          <div className="flex space-x-1">
            <button 
              onClick={() => onPeriodChange('1y')}
              className={`px-2 py-1 text-xs rounded ${period === '1y' ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100'}`}
            >
              1Y
            </button>
            <button 
              onClick={() => onPeriodChange('2y')}
              className={`px-2 py-1 text-xs rounded ${period === '2y' ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100'}`}
            >
              2Y
            </button>
            <button 
              onClick={() => onPeriodChange('5y')}
              className={`px-2 py-1 text-xs rounded ${period === '5y' ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100'}`}
            >
              5Y
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[200px] w-full rounded-md" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-[200px] bg-gray-50 rounded-md">
            <div className="text-center text-gray-500">
              <AlertCircle className="mx-auto h-10 w-10 text-gray-400 mb-2" />
              <p>Failed to load historical data</p>
            </div>
          </div>
        ) : !hasValidData ? (
          <div className="flex items-center justify-center h-[200px] bg-gray-50 rounded-md">
            <div className="text-center text-gray-500">
              <p>Insufficient historical data available</p>
            </div>
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart 
                data={historicalData} 
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(date) => {
                    try {
                      return new Date(date).toLocaleDateString('en-US', { 
                        month: 'short',
                        year: '2-digit' 
                      });
                    } catch (e) {
                      return '';
                    }
                  }}
                />
                <YAxis 
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => formatCurrency(value)}
                  width={80}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line 
                  type="monotone" 
                  dataKey="close" 
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  animationDuration={500}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SimpleStockChart;