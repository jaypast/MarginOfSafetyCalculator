import React, { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pencil, Check, X } from 'lucide-react';
import { StockData } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface KeyMetricsProps {
  stockData: StockData | undefined;
  isLoading: boolean;
  companyQuality?: 'Exceptional' | 'Good' | 'Average' | 'Speculative';
  onStockDataUpdate?: (updatedData: StockData) => void;
}

const getQualityColorClass = (quality?: string) => {
  switch (quality) {
    case 'Exceptional':
      return 'bg-green-100 text-green-800';
    case 'Good':
      return 'bg-blue-100 text-blue-800';
    case 'Average':
      return 'bg-yellow-100 text-yellow-800';
    case 'Speculative':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-neutral-100 text-neutral-800';
  }
};

const KeyMetrics: React.FC<KeyMetricsProps> = ({ 
  stockData, 
  isLoading,
  companyQuality,
  onStockDataUpdate
}) => {
  const [editedData, setEditedData] = useState<Partial<StockData>>({});
  const [isEditing, setIsEditing] = useState(false);
  
  // Reset edited data when stock data changes
  useEffect(() => {
    setEditedData({});
    setIsEditing(false);
  }, [stockData?.symbol]);
  
  if (!stockData && !isLoading) return null;
  
  const handleInputChange = (field: keyof StockData, value: string) => {
    const numericValue = parseFloat(value);
    if (!isNaN(numericValue)) {
      setEditedData(prev => ({ ...prev, [field]: numericValue }));
    } else if (value === '') {
      setEditedData(prev => ({ ...prev, [field]: '' }));
    }
  };
  
  const saveChanges = () => {
    if (stockData && onStockDataUpdate) {
      // Filter out empty string values and create updated stock data
      const updatedData = { ...stockData };
      
      Object.entries(editedData).forEach(([key, value]) => {
        if (value !== '') {
          updatedData[key as keyof StockData] = value as never;
        }
      });
      
      onStockDataUpdate(updatedData);
      setIsEditing(false);
      setEditedData({});
    }
  };
  
  // Automatically update calculations when editing values
  useEffect(() => {
    if (isEditing && stockData && onStockDataUpdate && Object.keys(editedData).length > 0) {
      // Create a working copy of data with edits applied
      const workingData = { ...stockData };
      
      Object.entries(editedData).forEach(([key, value]) => {
        if (value !== '') {
          workingData[key as keyof StockData] = value as never;
        }
      });
      
      // Update calculations in real-time as user edits
      onStockDataUpdate(workingData);
    }
  }, [editedData, isEditing, onStockDataUpdate, stockData]);
  
  const cancelEditing = () => {
    setIsEditing(false);
    setEditedData({});
  };
  
  // Function to render either the value display or edit input
  const renderMetricField = (label: string, field: keyof StockData, formatter: (value: number) => string) => {
    const currentValue = stockData ? stockData[field] as number : 0;
    const editValue = editedData[field] !== undefined ? String(editedData[field]) : currentValue.toString();
    
    return (
      <div className="bg-neutral-50 p-3 rounded-md">
        <p className="text-xs text-neutral-500 mb-1">{label}</p>
        {isLoading ? (
          <Skeleton className="h-6 w-24" />
        ) : isEditing ? (
          <Input
            value={editValue}
            onChange={(e) => handleInputChange(field, e.target.value)}
            className="h-8 p-1 text-base font-medium"
          />
        ) : (
          <p className="text-[#1A2942] font-semibold text-lg">
            {stockData ? formatter(currentValue) : '-'}
          </p>
        )}
      </div>
    );
  };
  
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-neutral-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-[#1A2942]">
          Key Metrics {stockData && <span className="text-sm font-normal">- {stockData.name}</span>}
        </h2>
        
        {stockData && !isLoading && (
          <div>
            {isEditing ? (
              <div className="flex space-x-2">
                <Button 
                  onClick={saveChanges} 
                  size="sm" 
                  variant="outline"
                  className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                >
                  <Check className="h-4 w-4 mr-1" /> Save
                </Button>
                <Button 
                  onClick={cancelEditing}
                  size="sm" 
                  variant="outline"
                  className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                >
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
              </div>
            ) : (
              <Button 
                onClick={() => setIsEditing(true)}
                size="sm" 
                variant="outline"
                className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              >
                <Pencil className="h-4 w-4 mr-1" /> Edit Data
              </Button>
            )}
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Current Price */}
        {renderMetricField('Current Price', 'price', val => formatCurrency(val))}
        
        {/* EPS */}
        {renderMetricField('EPS (TTM)', 'eps', val => formatCurrency(val))}
        
        {/* P/E Ratio */}
        {renderMetricField('P/E Ratio', 'peRatio', val => val.toFixed(1))}
        
        {/* FCF per Share */}
        {renderMetricField('FCF per Share', 'fcfPerShare', val => formatCurrency(val))}
        
        {/* Growth Rate */}
        {renderMetricField('Growth Rate (5Y)', 'growthRate', val => `${val.toFixed(2)}%`)}
        
        {/* ROE */}
        {renderMetricField('ROE', 'roe', val => `${val.toFixed(1)}%`)}
      </div>
      
      {/* Quality Assessment */}
      {stockData && companyQuality && (
        <div className="mt-5 bg-[#E9ECF1] p-4 rounded-md border border-[#C4CCD9]">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-[#21324F]">Company Quality</h4>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getQualityColorClass(companyQuality)}`}>
              {companyQuality}
            </span>
          </div>
          <p className="text-sm text-neutral-600">Based on financial strength, competitive position, and historical performance</p>
        </div>
      )}
      
      {isEditing && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs text-blue-700">
            <strong>Note:</strong> Editing these values will adjust the calculations but won't affect data stored in our database. 
            Changes will reset if you search for a new stock.
          </p>
        </div>
      )}
    </div>
  );
};

export default KeyMetrics;